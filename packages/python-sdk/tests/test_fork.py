"""End to end on a LOCAL Anvil fork of Base Mainnet (nothing is sent to Base): the real ARL escrow
and token. Start the fork first, then run:

    anvil --fork-url https://base-rpc.publicnode.com --port 18546
    ARL_FORK_RPC=http://127.0.0.1:18546 python -m pytest tests/test_fork.py

Anvil's development accounts sign; the Community & Staking Safe is impersonated only to hand the
client 100 ARL on the fork.
"""

import os

import pytest
from web3 import Web3

from arl_protocol import Arl, ArlError

RPC = os.environ.get("ARL_FORK_RPC")
ARL = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4"
COMMUNITY_SAFE = "0xfF12597A671ebAF0cAe37999EE659e03c4f444B5"
# Anvil development accounts 0 and 1 (public test keys, unlocked on every Anvil node).
CLIENT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PROVIDER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

pytestmark = pytest.mark.skipif(not RPC, reason="set ARL_FORK_RPC to an Anvil fork of Base")


def test_job_lifecycle_on_a_fork():
    client = Arl(private_key=CLIENT_KEY, rpc_url=RPC)
    provider = Arl(private_key=PROVIDER_KEY, rpc_url=RPC)
    w3 = client.w3

    w3.provider.make_request("anvil_impersonateAccount", [COMMUNITY_SAFE])
    w3.provider.make_request("anvil_setBalance", [COMMUNITY_SAFE, hex(10**18)])
    token = w3.eth.contract(
        address=ARL,
        abi=[
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
                "inputs": [{"name": "", "type": "address"}],
                "outputs": [{"name": "", "type": "uint256"}],
            },
        ],
    )
    tx = token.functions.transfer(client.address, 100 * 10**18).transact({"from": COMMUNITY_SAFE})
    w3.eth.wait_for_transaction_receipt(tx)

    job = client.create_job(provider=provider.address, hours=24, description="Python fork test")
    assert client.get_job(job).status == "Open"

    with pytest.raises(ArlError):
        client.fund(job)  # no budget yet

    client.set_budget(job, "10")
    client.fund(job)
    assert client.get_job(job).status == "Funded"

    before = token.functions.balanceOf(provider.address).call()
    provider.submit(job, "https://example.com/result")
    assert client.get_job(job).status == "Submitted"

    client.complete(job, "checked")
    done = client.get_job(job)
    assert done.status == "Completed"
    assert str(done.budget) == "10"
    assert token.functions.balanceOf(provider.address).call() > before
    assert Web3.is_checksum_address(done.provider)
