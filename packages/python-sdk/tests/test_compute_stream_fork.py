"""Compute streams end to end on a LOCAL Anvil fork of Base Mainnet (nothing is sent to Base):
the real ComputePayment contract and the real ARL token.

    anvil --fork-url https://mainnet.base.org --port 18547 --chain-id 8453
    ARL_FORK_RPC=http://127.0.0.1:18547 python -m pytest tests/test_compute_stream_fork.py

Anvil's development accounts are the client and the provider. The Grants Safe is impersonated only
to hand the client ARL on the fork.
"""

import json
import os

import pytest
from web3 import Web3

from arl_protocol import ComputeStreams, ServeOnStream, stream_auth_headers

RPC = os.environ.get("ARL_FORK_RPC")
ARL = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4"
GRANTS_SAFE = "0xA1B52BA110A2738E5769dE3F9d0BE70E1b0604A3"
# Anvil development accounts 0, 1 and 2 (public test keys, unlocked on every Anvil node).
CLIENT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PROVIDER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
STRANGER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
RATE = 10**16  # 0.01 ARL per second
ERC20 = [
    {
        "type": "function",
        "name": "transfer",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "type": "function",
        "name": "balanceOf",
        "stateMutability": "view",
        "inputs": [{"name": "owner", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

pytestmark = pytest.mark.skipif(not RPC, reason="set ARL_FORK_RPC to an Anvil fork of Base")


def test_a_python_service_serves_while_a_stream_pays_it():
    # The fork is put back as it was, so the test can run again on the same node.
    w3 = Web3(Web3.HTTPProvider(RPC))
    snapshot = w3.provider.make_request("evm_snapshot", [])["result"]
    try:
        run_the_flow(w3)
    finally:
        w3.provider.make_request("evm_revert", [snapshot])


def run_the_flow(w3):
    client = w3.eth.account.from_key(CLIENT_KEY)
    provider = w3.eth.account.from_key(PROVIDER_KEY)
    token = w3.eth.contract(address=ARL, abi=ERC20)

    w3.provider.make_request("anvil_impersonateAccount", [GRANTS_SAFE])
    w3.provider.make_request("anvil_setBalance", [GRANTS_SAFE, hex(10**18)])
    funded = token.functions.transfer(client.address, 6 * 10**18).transact({"from": GRANTS_SAFE})
    assert w3.eth.wait_for_transaction_receipt(funded).status == 1
    w3.provider.make_request("anvil_stopImpersonatingAccount", [GRANTS_SAFE])
    before = token.functions.balanceOf(provider.address).call()

    def forward_to(timestamp):
        w3.provider.make_request("evm_setNextBlockTimestamp", [timestamp])
        w3.provider.make_request("evm_mine", [])

    def now():
        return w3.eth.get_block("latest")["timestamp"]

    service = ServeOnStream(provider=provider.address, rate_per_second=RATE, rpc_url=RPC)
    streams = ComputeStreams(CLIENT_KEY, rpc_url=RPC)

    # 1. Without a stream the service names its terms.
    assert service.handle({}, lambda s: "never").status == 402

    # 2. The client opens a ten-minute stream and is served.
    stream = streams.open(provider=provider.address, rate_per_second=RATE, max_seconds=600)
    assert stream.live and stream.deposit == 6 * 10**18 and stream.sender == client.address

    def ask(key):
        headers = stream_auth_headers(key, stream.stream_id, now=now())
        return service.handle(headers, lambda s: {"completion": "ok", "left": s.seconds_left})

    served = ask(CLIENT_KEY)
    assert served.status == 200 and json.loads(served.body)["completion"] == "ok"

    # 3. Another account naming the same stream is refused.
    stolen = ask(STRANGER_KEY)
    assert stolen.status == 402
    assert json.loads(stolen.body)["error"] == "the signature is not the stream sender's"

    # 4. 100 seconds in, the provider takes what it has earned; the stream keeps running.
    forward_to(stream.start_time + 99)
    w3.provider.make_request("evm_setNextBlockTimestamp", [stream.start_time + 100])
    ComputeStreams(PROVIDER_KEY, rpc_url=RPC).withdraw(stream.stream_id)
    assert token.functions.balanceOf(provider.address).call() - before == RATE * 100
    assert ask(CLIENT_KEY).status == 200

    # 5. The client stops at 250 seconds: the provider holds 250 seconds of pay, the rest returns.
    forward_to(stream.start_time + 249)
    w3.provider.make_request("evm_setNextBlockTimestamp", [stream.start_time + 250])
    streams.stop(stream.stream_id)
    assert token.functions.balanceOf(provider.address).call() - before == RATE * 250
    assert token.functions.balanceOf(client.address).call() == RATE * 350
    ended = ask(CLIENT_KEY)
    assert ended.status == 402 and json.loads(ended.body)["error"] == "the stream has ended"
