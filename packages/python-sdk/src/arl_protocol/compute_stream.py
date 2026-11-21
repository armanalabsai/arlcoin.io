"""Compute paid by the second (ComputePayment on Base Mainnet), for both sides of a stream.

A client opens a stream to a provider at a rate per second for at most a fixed time and escrows
``rate × seconds`` ARL. The provider earns the rate every second until the stream is stopped or
runs out; whatever was not earned returns to the client.

The provider's service answers only while the caller's stream pays it:

    service = ServeOnStream(provider=ME, rate_per_second=10**16)          # 0.01 ARL per second

    @app.post("/v1/completions")              # FastAPI; any framework works the same way
    async def completions(request: Request):
        r = service.handle(request.headers, lambda stream: run_the_model(...))
        return Response(r.body, r.status, r.headers)

Without an ``X-ARL-Stream`` header the service answers 402 with its terms. Stream ids are public,
so the caller proves the stream is its own by signing a short message with the account that
opened it (``stream_auth_headers``); the service checks that signature on every request.

    streams = ComputeStreams(private_key=KEY)                              # the client
    stream = streams.open(provider=PROVIDER, rate_per_second=10**16, max_seconds=600)
    headers = stream_auth_headers(KEY, stream.stream_id)
    ...
    streams.stop(stream.stream_id)                                          # refunds the rest

The provider takes what it has earned with ``ComputeStreams(private_key=...).withdraw(id)``.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping

from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

from .client import BASE_MAINNET_CHAIN_ID, DEFAULT_RPC, ArlError, _fn
from .pay_on_proof import PaidResponse, _json, _to_bytes

# The ComputePayment contract on Base Mainnet (docs/mainnet-services.md), paid in ARL.
COMPUTE_PAYMENT = "0x1bFE932896fdd32175836a7364dcaf53d49EE464"
STREAM_SCHEME = "arl-stream"
STREAM_HEADER = "X-ARL-Stream"
STREAM_SIGNATURE_HEADER = "X-ARL-Stream-Signature"
MAX_STREAM_SECONDS = 365 * 24 * 60 * 60

_ZERO = "0x" + "00" * 20
_HEADER = re.compile(r"^(\d+):(0x[0-9a-fA-F]{40}):(\d+)$")
_PROOF = re.compile(r"^(\d+):(0x[0-9a-fA-F]+)$")
# ERC-1271: the value a contract account returns for a signature it accepts.
_ERC1271_MAGIC = bytes.fromhex("1626ba7e")

_STREAM_TUPLE = {
    "name": "",
    "type": "tuple",
    "components": [
        {"name": n, "type": t}
        for n, t in (
            ("sender", "address"),
            ("startTime", "uint40"),
            ("endTime", "uint40"),
            ("provider", "address"),
            ("stopTime", "uint40"),
            ("settled", "bool"),
            ("ratePerSecond", "uint128"),
            ("withdrawn", "uint128"),
        )
    ],
}
_ABI = [
    {**_fn("getStream", [("streamId", "uint256")], [], "view"), "outputs": [_STREAM_TUPLE]},
    _fn("streamedAmountOf", [("streamId", "uint256")], ["uint256"], "view"),
    _fn("withdrawableAmountOf", [("streamId", "uint256")], ["uint256"], "view"),
    _fn("paymentToken", [], ["address"], "view"),
    _fn("streamCounter", [], ["uint256"], "view"),
    _fn(
        "streamCompute",
        [("provider", "address"), ("ratePerSecond", "uint128"), ("maxDuration", "uint40")],
        ["uint256"],
    ),
    _fn("withdraw", [("streamId", "uint256")], ["uint256"]),
    _fn("stopStream", [("streamId", "uint256")], ["uint256", "uint256"]),
    {
        "type": "event",
        "name": "StreamStarted",
        "anonymous": False,
        "inputs": [
            {"name": "streamId", "type": "uint256", "indexed": True},
            {"name": "sender", "type": "address", "indexed": True},
            {"name": "provider", "type": "address", "indexed": True},
            {"name": "ratePerSecond", "type": "uint256", "indexed": False},
            {"name": "startTime", "type": "uint256", "indexed": False},
            {"name": "endTime", "type": "uint256", "indexed": False},
            {"name": "deposit", "type": "uint256", "indexed": False},
        ],
    },
]
_ERC20_ABI = [
    _fn("balanceOf", [("owner", "address")], ["uint256"], "view"),
    _fn("allowance", [("owner", "address"), ("spender", "address")], ["uint256"], "view"),
    _fn("approve", [("spender", "address"), ("amount", "uint256")], ["bool"]),
]
_ERC1271_ABI = [
    _fn("isValidSignature", [("hash", "bytes32"), ("signature", "bytes")], ["bytes4"], "view")
]


@dataclass(frozen=True)
class StreamState:
    """A stream as the contract holds it, at the block it was read. Amounts are ARL base units."""

    stream_id: int
    contract: str
    sender: str
    provider: str
    rate_per_second: int
    start_time: int
    end_time: int
    stop_time: int
    settled: bool
    deposit: int
    streamed: int
    withdrawable: int
    live: bool
    seconds_left: int
    read_at: int


def stream_auth_message(chain_id: int, contract: str, stream_id: int, timestamp: int) -> str:
    """The message a caller signs to prove a stream is its own (the same text as the TypeScript
    SDK's ``streamAuthMessage``)."""
    return (
        f"ARL compute stream {chain_id}:{Web3.to_checksum_address(contract)}:{stream_id}"
        f" at {timestamp}"
    )


def stream_auth_headers(
    private_key: str,
    stream_id: int,
    *,
    chain_id: int = BASE_MAINNET_CHAIN_ID,
    contract: str = COMPUTE_PAYMENT,
    now: int | None = None,
) -> dict[str, str]:
    """The two headers a client sends to a service behind ``ServeOnStream``. ``private_key`` is
    the account that opened the stream; ``now`` is Unix seconds (default: this machine's clock)."""
    at = int(time.time()) if now is None else now
    address = Web3.to_checksum_address(contract)
    message = encode_defunct(text=stream_auth_message(chain_id, address, stream_id, at))
    signature = Account.sign_message(message, private_key=private_key).signature
    return {
        STREAM_HEADER: f"{chain_id}:{address}:{stream_id}",
        STREAM_SIGNATURE_HEADER: f"{at}:0x{bytes(signature).hex()}",
    }


class ComputeStreams:
    """Reads streams, and with a ``private_key`` opens, stops and withdraws them."""

    def __init__(
        self,
        private_key: str | None = None,
        *,
        rpc_url: str = DEFAULT_RPC,
        contract: str = COMPUTE_PAYMENT,
    ):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = self.w3.eth.account.from_key(private_key) if private_key else None
        self.address = Web3.to_checksum_address(contract)
        self.contract = self.w3.eth.contract(address=self.address, abi=_ABI)

    def get(self, stream_id: int) -> StreamState:
        """The stream now. Raises ``ArlError`` when it does not exist."""
        block = self.w3.eth.get_block("latest")
        at = block["number"]
        s = self.contract.functions.getStream(stream_id).call(block_identifier=at)
        sender, start, end, provider, stop, settled, rate, _withdrawn = s
        if sender.lower() == _ZERO:
            raise ArlError(f"stream {stream_id} does not exist")
        streamed = self.contract.functions.streamedAmountOf(stream_id).call(block_identifier=at)
        withdrawable = self.contract.functions.withdrawableAmountOf(stream_id).call(
            block_identifier=at
        )
        now = block["timestamp"]
        live = not settled and stop == 0 and now < end
        return StreamState(
            stream_id=stream_id,
            contract=self.address,
            sender=sender,
            provider=provider,
            rate_per_second=rate,
            start_time=start,
            end_time=end,
            stop_time=stop,
            settled=settled,
            deposit=rate * (end - start),
            streamed=streamed,
            withdrawable=withdrawable,
            live=live,
            seconds_left=end - now if live else 0,
            read_at=now,
        )

    def _send(self, call) -> Any:
        if self.account is None:
            raise ArlError("a private_key is needed to send transactions")
        try:
            call.call({"from": self.account.address})
        except Exception as error:  # the revert reason, before any gas is spent
            raise ArlError(str(error)) from error
        tx = call.build_transaction(
            {
                "from": self.account.address,
                "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
            }
        )
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt.status != 1:
            raise ArlError(f"transaction {tx_hash.hex()} reverted")
        return receipt

    def open(
        self,
        *,
        provider: str,
        rate_per_second: int,
        max_seconds: int,
        max_cap: int | None = None,
    ) -> StreamState:
        """Opens a stream to ``provider``: approves exactly the deposit when the allowance is
        short, escrows ``rate_per_second × max_seconds`` and returns the stream. ``max_cap`` is the
        most the client accepts to escrow."""
        if self.account is None:
            raise ArlError("a private_key is needed to open a stream")
        if rate_per_second <= 0:
            raise ArlError("rate_per_second must be positive")
        if not 0 < max_seconds <= MAX_STREAM_SECONDS:
            raise ArlError(f"max_seconds must be between 1 and {MAX_STREAM_SECONDS}")
        deposit = rate_per_second * max_seconds
        if max_cap is not None and deposit > max_cap:
            raise ArlError(f"deposit {deposit} exceeds max_cap {max_cap}")
        token = self.w3.eth.contract(
            address=self.contract.functions.paymentToken().call(), abi=_ERC20_ABI
        )
        me = self.account.address
        if token.functions.balanceOf(me).call() < deposit:
            raise ArlError(f"balance is below the deposit {deposit}")
        if token.functions.allowance(me, self.address).call() < deposit:
            # Exactly the deposit: the contract is never left with a standing allowance.
            self._send(token.functions.approve(self.address, deposit))
        receipt = self._send(
            self.contract.functions.streamCompute(
                Web3.to_checksum_address(provider), rate_per_second, max_seconds
            )
        )
        started = self.contract.events.StreamStarted().process_receipt(receipt)
        if not started:
            raise ArlError("no StreamStarted event in the transaction")
        return self.get(started[0]["args"]["streamId"])

    def withdraw(self, stream_id: int) -> str:
        """As the provider: takes what the stream has earned so far. The stream keeps running."""
        return self._send(self.contract.functions.withdraw(stream_id))["transactionHash"].hex()

    def stop(self, stream_id: int) -> str:
        """Stops and settles the stream (the sender or the provider at any time, anyone after its
        end): the provider keeps what it earned and the sender is refunded the rest."""
        return self._send(self.contract.functions.stopStream(stream_id))["transactionHash"].hex()


class ServeOnStream:
    """A service that answers only while the caller's stream pays it."""

    def __init__(
        self,
        *,
        provider: str,
        rate_per_second: int,
        rpc_url: str = DEFAULT_RPC,
        chain_id: int = BASE_MAINNET_CHAIN_ID,
        contract: str = COMPUTE_PAYMENT,
        min_seconds_left: int = 1,
        max_signature_age: int = 300,
    ):
        if rate_per_second <= 0:
            raise ArlError("rate_per_second must be positive")
        self.provider = Web3.to_checksum_address(provider)
        self.rate_per_second = rate_per_second
        self.chain_id = chain_id
        self.min_seconds_left = min_seconds_left
        self.max_signature_age = max_signature_age
        self.streams = ComputeStreams(rpc_url=rpc_url, contract=contract)

    def offer(self) -> dict:
        """The 402 answer: the service's terms, in x402's shape."""
        return {
            "x402Version": 2,
            "accepts": [
                {
                    "scheme": STREAM_SCHEME,
                    "network": f"eip155:{self.chain_id}",
                    "payTo": self.provider,
                    "extra": {
                        "contract": self.streams.address,
                        "ratePerSecond": str(self.rate_per_second),
                        "minSecondsLeft": str(self.min_seconds_left),
                    },
                }
            ],
        }

    def _signed_by(self, sender: str, message: str, signature: bytes) -> bool:
        signable = encode_defunct(text=message)
        try:
            if Account.recover_message(signable, signature=signature).lower() == sender.lower():
                return True
        except Exception:
            pass
        # A contract account (ERC-1271) says itself whether it accepts the signature.
        w3 = self.streams.w3
        try:
            if not w3.eth.get_code(Web3.to_checksum_address(sender)):
                return False
            digest = Web3.keccak(b"\x19Ethereum Signed Message:\n" + str(len(message)).encode() + message.encode())
            wallet = w3.eth.contract(address=Web3.to_checksum_address(sender), abi=_ERC1271_ABI)
            return wallet.functions.isValidSignature(digest, signature).call() == _ERC1271_MAGIC
        except Exception:
            return False

    def check(self, headers: Mapping[str, str]) -> StreamState | PaidResponse:
        """The caller's stream when it may be served, otherwise the response to send back."""
        lowered = {k.lower(): v for k, v in headers.items()}
        header = lowered.get(STREAM_HEADER.lower())
        offer = self.offer()
        if not header:
            return _json(402, offer)
        m = _HEADER.match(header)
        if not m:
            return _json(400, {"error": f"{STREAM_HEADER} must be <chainId>:<contract>:<streamId>"})
        proof = _PROOF.match(lowered.get(STREAM_SIGNATURE_HEADER.lower(), ""))
        if not proof:
            return _json(
                400, {"error": f"{STREAM_SIGNATURE_HEADER} must be <unix seconds>:<signature>"}
            )

        def refuse(reason: str) -> PaidResponse:
            return _json(402, {**offer, "error": reason})

        if int(m.group(1)) != self.chain_id or m.group(2).lower() != self.streams.address.lower():
            return refuse("the stream is on another chain or contract")
        stream_id = int(m.group(3))
        try:
            stream = self.streams.get(stream_id)
        except ArlError:
            return refuse("no such stream")
        except Exception:  # an RPC or library error stays on the server
            return _json(502, {"error": "the chain could not be read; ask again"})
        if stream.provider.lower() != self.provider.lower():
            return refuse("the stream pays another provider")
        if stream.rate_per_second < self.rate_per_second:
            return refuse("the stream's rate is too low")
        if not stream.live:
            return refuse("the stream has ended")
        if stream.seconds_left < self.min_seconds_left:
            return refuse("the stream is about to end")
        signed_at = int(proof.group(1))
        if abs(signed_at - stream.read_at) > self.max_signature_age:
            return refuse("the signature is too old")
        try:
            signature = bytes.fromhex(proof.group(2)[2:])
        except ValueError:
            return refuse("the signature is not the stream sender's")
        message = stream_auth_message(self.chain_id, self.streams.address, stream_id, signed_at)
        if not self._signed_by(stream.sender, message, signature):
            return refuse("the signature is not the stream sender's")
        return stream

    def handle(
        self, headers: Mapping[str, str], work: Callable[[StreamState], Any]
    ) -> PaidResponse:
        """Serves one request: ``work(stream)`` runs only when the caller's stream pays this
        provider. Its result may be bytes, a string, or anything JSON can encode."""
        checked = self.check(headers)
        if isinstance(checked, PaidResponse):
            return checked
        body, content = _to_bytes(work(checked))
        return PaidResponse(200, body, content)
