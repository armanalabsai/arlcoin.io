"""Pay on proof, end to end on a LOCAL Anvil fork of Base Mainnet (nothing is sent to Base): the
real ARL escrow, the real verified evaluator and the validators staked on it.

    anvil --fork-url https://base-rpc.publicnode.com --port 18547
    ARL_FORK_RPC=http://127.0.0.1:18547 python -m pytest tests/test_pay_on_proof_fork.py

Anvil's development accounts are the client and the service. The Grants Safe is impersonated only
to hand the client ARL on the fork, and the three validators only to accept the job there.
"""

import json
import os

import pytest
from web3 import Web3

from arl_protocol import ESCROWS, EVALUATORS
from arl_protocol.pay_on_proof import DELIVERABLE_HEADER, JOB_HEADER, Offer, PayOnProof

RPC = os.environ.get("ARL_FORK_RPC")
ARL = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4"
GRANTS_SAFE = "0xA1B52BA110A2738E5769dE3F9d0BE70E1b0604A3"
# Anvil development accounts 0 and 1 (public test keys, unlocked on every Anvil node).
CLIENT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
SERVICE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ZERO = "0x0000000000000000000000000000000000000000"
BUDGET = 100 * 10**18
SPEC_HASH = "0x" + "5a" * 32
DELIVERABLE = "0x" + "d1" * 32

pytestmark = pytest.mark.skipif(not RPC, reason="set ARL_FORK_RPC to an Anvil fork of Base")


def fn(name, inputs, outputs=(), mutability="nonpayable"):
    return {
        "type": "function",
        "name": name,
        "stateMutability": mutability,
        "inputs": inputs,
        "outputs": [{"name": "", "type": t} for t in outputs],
    }


def arg(name, kind):
    return {"name": name, "type": kind}


CONFIG = {
    "name": "cfg",
    "type": "tuple",
    "components": [
        arg("tier", "uint8"),
        arg("threshold", "uint8"),
        arg("voteWindow", "uint64"),
        arg("challengeWindow", "uint64"),
        arg("bond", "uint96"),
        arg("providerAgentId", "uint256"),
        arg("specHash", "bytes32"),
        arg("committee", "address[]"),
    ],
}
ABI = [
    fn("transfer", [arg("to", "address"), arg("amount", "uint256")], ["bool"]),
    fn("approve", [arg("spender", "address"), arg("amount", "uint256")], ["bool"]),
    fn("jobCounter", [], ["uint256"], "view"),
    fn(
        "createJob",
        [
            arg("provider", "address"),
            arg("evaluator", "address"),
            arg("expiredAt", "uint256"),
            arg("description", "string"),
            arg("hook", "address"),
        ],
        ["uint256"],
    ),
    fn("setBudget", [arg("jobId", "uint256"), arg("amount", "uint256"), arg("optParams", "bytes")]),
    fn("fund", [arg("jobId", "uint256"), arg("expectedBudget", "uint256"), arg("optParams", "bytes")]),
    fn("configure", [arg("jobId", "uint256"), CONFIG]),
    fn("accept", [arg("jobId", "uint256")]),
    fn("stakeOf", [arg("validator", "address")], ["uint256"], "view"),
]


def test_a_python_service_is_paid_through_a_verified_job():
    # The fork is put back as it was, so the test can run again on the same node.
    w3 = Web3(Web3.HTTPProvider(RPC))
    snapshot = w3.provider.make_request("evm_snapshot", [])["result"]
    try:
        run_the_flow(w3)
    finally:
        w3.provider.make_request("evm_revert", [snapshot])


def run_the_flow(w3):
    client = w3.eth.account.from_key(CLIENT_KEY)
    service = w3.eth.account.from_key(SERVICE_KEY)
    jobs = w3.eth.contract(address=ESCROWS["ARL"], abi=ABI)
    evaluator = w3.eth.contract(address=EVALUATORS["ARL"], abi=ABI)
    token = w3.eth.contract(address=ARL, abi=ABI)

    def send(account, call):
        tx = call.build_transaction(
            {"from": account.address, "nonce": w3.eth.get_transaction_count(account.address)}
        )
        receipt = w3.eth.wait_for_transaction_receipt(
            w3.eth.send_raw_transaction(account.sign_transaction(tx).raw_transaction)
        )
        assert receipt.status == 1

    def as_account(address, call):
        w3.provider.make_request("anvil_impersonateAccount", [address])
        w3.provider.make_request("anvil_setBalance", [address, hex(10**18)])
        receipt = w3.eth.wait_for_transaction_receipt(call.transact({"from": address}))
        w3.provider.make_request("anvil_stopImpersonatingAccount", [address])
        assert receipt.status == 1

    # The committee: three validators staked on the live evaluator (arlcoin.io/api/v1/validators).
    # Each needs a free bond of 100 ARL.
    committee = [
        "0x7E8e18bf48F07B82F64b846b0d509ad79FD86244",
        "0xdAa1EFD5E765Baf67D8013C1c67039945819B760",
        "0x394846C9E1161A07471F9e8baEda77E4AEa85fa1",
    ]
    for member in committee:
        assert evaluator.functions.stakeOf(member).call() >= 100 * 10**18, member

    as_account(GRANTS_SAFE, token.functions.transfer(client.address, BUDGET))

    offer = Offer(
        provider=service.address,
        spec_uri="https://example.org/spec.json",
        spec_hash=SPEC_HASH,
        budget=BUDGET,
        committee=committee,
        threshold=2,
        vote_window=7_200,
    )
    paid = PayOnProof(
        private_key=SERVICE_KEY, offer=offer, rpc_url=RPC, background=False, poll_seconds=0.2
    )

    # 1. Without a job the service answers 402 with its terms.
    first = paid.handle(None, lambda job: ("never", DELIVERABLE))
    assert first.status == 402
    terms = json.loads(first.body)["accepts"][0]
    assert terms["scheme"] == "arl-escrow" and terms["amount"] == str(BUDGET)

    # 2. The client opens, configures and funds a job that matches the terms.
    job_id = jobs.functions.jobCounter().call() + 1
    deadline = w3.eth.get_block("latest")["timestamp"] + int(terms["extra"]["expiresIn"])
    send(
        client,
        jobs.functions.createJob(service.address, evaluator.address, deadline, offer.spec_uri, ZERO),
    )
    cfg = (1, 2, 7_200, 86_400, 100 * 10**18, 0, bytes.fromhex(SPEC_HASH[2:]), committee)
    send(client, evaluator.functions.configure(job_id, cfg))
    send(client, jobs.functions.setBudget(job_id, BUDGET, b""))
    send(client, token.functions.approve(jobs.address, BUDGET))
    send(client, jobs.functions.fund(job_id, BUDGET, b""))
    header = f"8453:{jobs.address}:{job_id}"

    # A job that does not match the offer is refused before any work.
    assert paid.handle(f"8453:{jobs.address}:{job_id + 1}", lambda job: ("x", DELIVERABLE)).status == 402

    # 3. The service checks the job, approves the committee and does the work; the validators
    #    accept; the deliverable is submitted on chain.
    ran = []

    def work(job):
        ran.append(job)
        for member in committee:
            as_account(member, evaluator.functions.accept(job.job_id))
        return {"summary": "passed=3 failed=0"}, DELIVERABLE

    answer = paid.handle(header, work)
    assert answer.status == 200
    assert json.loads(answer.body) == {"summary": "passed=3 failed=0"}
    assert answer.headers[JOB_HEADER] == header
    assert answer.headers[DELIVERABLE_HEADER] == DELIVERABLE
    assert ran[0].job_id == job_id and ran[0].client == client.address

    # The escrow holds the payment and the job is Submitted (2), waiting for the committee's vote.
    full = [{**fn("getJob", [arg("jobId", "uint256")], [], "view"), "outputs": [
        {"name": "", "type": "tuple", "components": [
            arg("id", "uint256"), arg("client", "address"), arg("provider", "address"),
            arg("evaluator", "address"), arg("description", "string"), arg("budget", "uint256"),
            arg("expiredAt", "uint256"), arg("status", "uint8"), arg("hook", "address")]}]}]
    job = w3.eth.contract(address=jobs.address, abi=full).functions.getJob(job_id).call()
    assert job[7] == 2 and job[5] == BUDGET

    # 4. A job pays for one run.
    again = paid.handle(header, work)
    assert again.status == 409 and len(ran) == 1
