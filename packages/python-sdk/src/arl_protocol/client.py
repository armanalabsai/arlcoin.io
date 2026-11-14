"""The ARL escrows (ERC-8183) on Base Mainnet, wrapped in one small class.

Every write simulates first, so a call that would revert raises ArlError with the reason before
any gas is spent.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from web3 import Web3

BASE_MAINNET_CHAIN_ID = 8453
DEFAULT_RPC = "https://mainnet.base.org"
ZERO = "0x0000000000000000000000000000000000000000"

ESCROWS = {
    "ARL": "0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9",
    "USDC": "0xc833140D2eE8607fd41662cffFAc557f3D535bE6",
}
STATUS = ("Open", "Funded", "Submitted", "Completed", "Rejected", "Expired")


def _fn(name, inputs, outputs=(), mutability="nonpayable"):
    return {
        "type": "function",
        "name": name,
        "stateMutability": mutability,
        "inputs": [{"name": n, "type": t} for n, t in inputs],
        "outputs": [{"name": "", "type": t} for t in outputs],
    }


JOB_TUPLE = {
    "name": "",
    "type": "tuple",
    "components": [
        {"name": n, "type": t}
        for n, t in (
            ("id", "uint256"),
            ("client", "address"),
            ("provider", "address"),
            ("evaluator", "address"),
            ("description", "string"),
            ("budget", "uint256"),
            ("expiredAt", "uint256"),
            ("status", "uint8"),
            ("hook", "address"),
        )
    ],
}

JOBS_ABI = [
    _fn("paymentToken", [], ["address"], "view"),
    {**_fn("getJob", [("jobId", "uint256")], [], "view"), "outputs": [JOB_TUPLE]},
    _fn(
        "createJob",
        [
            ("provider", "address"),
            ("evaluator", "address"),
            ("expiredAt", "uint256"),
            ("description", "string"),
            ("hook", "address"),
        ],
        ["uint256"],
    ),
    _fn("setBudget", [("jobId", "uint256"), ("amount", "uint256"), ("optParams", "bytes")]),
    _fn("fund", [("jobId", "uint256"), ("expectedBudget", "uint256"), ("optParams", "bytes")]),
    _fn("submit", [("jobId", "uint256"), ("deliverable", "bytes32"), ("optParams", "bytes")]),
    _fn("complete", [("jobId", "uint256"), ("reason", "bytes32"), ("optParams", "bytes")]),
    _fn("reject", [("jobId", "uint256"), ("reason", "bytes32"), ("optParams", "bytes")]),
    _fn("claimRefund", [("jobId", "uint256")]),
    {
        "type": "event",
        "name": "JobCreated",
        "anonymous": False,
        "inputs": [
            {"name": "jobId", "type": "uint256", "indexed": True},
            {"name": "client", "type": "address", "indexed": True},
            {"name": "provider", "type": "address", "indexed": True},
            {"name": "evaluator", "type": "address", "indexed": False},
            {"name": "expiredAt", "type": "uint256", "indexed": False},
            {"name": "hook", "type": "address", "indexed": False},
        ],
    },
]

ERC20_ABI = [
    _fn("decimals", [], ["uint8"], "view"),
    _fn("allowance", [("owner", "address"), ("spender", "address")], ["uint256"], "view"),
    _fn("approve", [("spender", "address"), ("amount", "uint256")], ["bool"]),
]


class ArlError(Exception):
    """A job call that cannot go through, with a reason a person can act on."""


@dataclass
class Job:
    id: int
    client: str
    provider: str
    evaluator: str
    description: str
    budget: Decimal
    expires_at: int
    status: str


def to_bytes32(value: str | bytes) -> bytes:
    """A 32-byte hash is used as it is; any other text is hashed (only the hash goes on chain)."""
    if isinstance(value, bytes) and len(value) == 32:
        return value
    text = str(value).strip()
    if text.startswith("0x") and len(text) == 66:
        return bytes.fromhex(text[2:])
    if not text:
        raise ArlError("the deliverable or reason is empty")
    return Web3.keccak(text=text)


def to_units(amount: str | int | float | Decimal, decimals: int) -> int:
    value = Decimal(str(amount))
    if value <= 0:
        raise ArlError(f"the amount must be above zero: {amount}")
    units = value * (Decimal(10) ** decimals)
    if units != units.to_integral_value():
        raise ArlError(f"too many decimals for this token: {amount}")
    return int(units)


class Arl:
    """One wallet, one escrow (ARL by default, or USDC), on Base Mainnet."""

    def __init__(self, private_key: str, token: str = "ARL", rpc_url: str = DEFAULT_RPC):
        if token not in ESCROWS:
            raise ArlError(f"token must be ARL or USDC, not {token}")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = self.w3.eth.account.from_key(private_key)
        self.address = self.account.address
        self.jobs = self.w3.eth.contract(address=ESCROWS[token], abi=JOBS_ABI)
        self._token = None
        self._decimals = None

    # ------------------------------------------------------------------ helpers

    def _check_chain(self) -> None:
        chain = self.w3.eth.chain_id
        if chain != BASE_MAINNET_CHAIN_ID:
            raise ArlError(f"the RPC serves chain {chain}, not Base Mainnet (8453)")

    @property
    def token(self):
        if self._token is None:
            address = self.jobs.functions.paymentToken().call()
            self._token = self.w3.eth.contract(address=address, abi=ERC20_ABI)
        return self._token

    @property
    def decimals(self) -> int:
        if self._decimals is None:
            self._decimals = self.token.functions.decimals().call()
        return self._decimals

    def _send(self, call):
        try:
            call.call({"from": self.address})
        except Exception as error:  # the revert reason, before any gas is spent
            raise ArlError(str(error)) from error
        tx = call.build_transaction(
            {"from": self.address, "nonce": self.w3.eth.get_transaction_count(self.address)}
        )
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt.status != 1:
            raise ArlError(f"transaction {tx_hash.hex()} reverted")
        return receipt

    # ------------------------------------------------------------------ jobs

    def create_job(
        self, provider: str, hours: float = 24, description: str = "", evaluator: str | None = None
    ) -> int:
        """Posts a job for `provider`. The evaluator is this wallet unless another is named."""
        self._check_chain()
        if not 1 <= hours <= 24 * 365:
            raise ArlError("the deadline must be between 1 hour and 365 days away")
        expires = self.w3.eth.get_block("latest")["timestamp"] + int(hours * 3600)
        receipt = self._send(
            self.jobs.functions.createJob(
                Web3.to_checksum_address(provider),
                Web3.to_checksum_address(evaluator or self.address),
                expires,
                description,
                ZERO,
            )
        )
        events = self.jobs.events.JobCreated().process_receipt(receipt)
        if not events:
            raise ArlError("the job was created but its id could not be read")
        return int(events[0]["args"]["jobId"])

    def set_budget(self, job_id: int, amount: str | int | float | Decimal) -> str:
        """Client or provider proposes the price, in token units."""
        self._check_chain()
        units = to_units(amount, self.decimals)
        return self._send(self.jobs.functions.setBudget(job_id, units, b"")).transactionHash.hex()

    def fund(self, job_id: int) -> str:
        """Escrows the agreed budget, approving the escrow first when needed."""
        self._check_chain()
        budget = self.jobs.functions.getJob(job_id).call()[5]
        if budget == 0:
            raise ArlError("no budget is set: call set_budget first")
        allowance = self.token.functions.allowance(self.address, self.jobs.address).call()
        if allowance < budget:
            self._send(self.token.functions.approve(self.jobs.address, budget))
        return self._send(self.jobs.functions.fund(job_id, budget, b"")).transactionHash.hex()

    def submit(self, job_id: int, deliverable: str | bytes) -> str:
        """Provider hands in the work: a link or text is hashed, a 32-byte hash is kept."""
        self._check_chain()
        call = self.jobs.functions.submit(job_id, to_bytes32(deliverable), b"")
        return self._send(call).transactionHash.hex()

    def complete(self, job_id: int, reason: str = "complete") -> str:
        """Evaluator accepts the work: the escrow pays the provider."""
        self._check_chain()
        call = self.jobs.functions.complete(job_id, to_bytes32(reason or "complete"), b"")
        return self._send(call).transactionHash.hex()

    def reject(self, job_id: int, reason: str = "reject") -> str:
        """Evaluator rejects the work: the escrow refunds the client."""
        self._check_chain()
        call = self.jobs.functions.reject(job_id, to_bytes32(reason or "reject"), b"")
        return self._send(call).transactionHash.hex()

    def claim_refund(self, job_id: int) -> str:
        """After the deadline, returns an unfinished job's escrow to the client."""
        self._check_chain()
        return self._send(self.jobs.functions.claimRefund(job_id)).transactionHash.hex()

    def get_job(self, job_id: int) -> Job:
        raw = self.jobs.functions.getJob(job_id).call()
        if raw[0] == 0:
            raise ArlError(f"job {job_id} does not exist")
        return Job(
            id=raw[0],
            client=raw[1],
            provider=raw[2],
            evaluator=raw[3],
            description=raw[4],
            budget=Decimal(raw[5]) / (Decimal(10) ** self.decimals),
            expires_at=raw[6],
            status=STATUS[raw[7]] if raw[7] < len(STATUS) else str(raw[7]),
        )
