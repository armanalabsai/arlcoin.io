"""open_task: every prepared transaction is checked against the task before anything is signed.

The answers below are built the way the Agent API builds them (the same calls as @arl/protocol
prepareTask); each test then tampers with one field and expects a refusal. No network.
"""

import json
from pathlib import Path

import pytest
from web3 import Web3

from arl_protocol import ESCROWS, EVALUATORS, ArlError
from arl_protocol.client import ERC20_ABI, JOBS_ABI
from arl_protocol.open_task import CONFIGURE_ABI, check_create, check_funding
from arl_protocol.task import committed_spec_hash, task_hash

VECTORS = Path(__file__).resolve().parents[3] / "spec" / "arl-task" / "v0.1.0" / "vectors.json"
TASK = next(v["task"] for v in json.loads(VECTORS.read_text("utf-8"))["valid"] if v["name"] == "reexec-arl")
PROVIDER = "0x2222222222222222222222222222222222222222"
TOKEN = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4"
COMMITTEE = [
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444",
    "0x5555555555555555555555555555555555555555",
]
BUDGET = int(TASK["payment"]["budget"])
NOW = 1_800_000_000
EXPIRES = NOW + TASK["payment"]["deadline_hours"] * 3600
SPEC = bytes.fromhex(committed_spec_hash(TASK)[2:])
w3 = Web3()
jobs = w3.eth.contract(address=ESCROWS["ARL"], abi=JOBS_ABI)
evaluator = w3.eth.contract(address=EVALUATORS["ARL"], abi=CONFIGURE_ABI)
erc20 = w3.eth.contract(address=TOKEN, abi=ERC20_ABI)


def tx(step, to, data):
    return {"step": step, "to": to, "data": data, "value": "0"}


def create_answer(provider=PROVIDER, description=None, to=ESCROWS["ARL"], expires=EXPIRES):
    description = description or f"arl-task:{task_hash(TASK)} https://example.com/task.json"
    data = jobs.encode_abi(
        "createJob", [provider, EVALUATORS["ARL"], expires, description, "0x" + "00" * 20]
    )
    return {"chainId": 8453, "transactions": [tx("createJob", to, data)]}


def funding_answer(job_id=7, budget=BUDGET, spender=ESCROWS["ARL"], **change):
    terms = {"tier": 1, "threshold": 2, "vote": 21600, "challenge": 86400, "bond": 10**20}
    terms.update({k: change[k] for k in terms if k in change})
    cfg = (
        terms["tier"],
        terms["threshold"],
        terms["vote"],
        terms["challenge"],
        terms["bond"],
        change.get("agent", 0),
        change.get("spec", SPEC),
        change.get("committee", COMMITTEE),
    )
    return {
        "chainId": 8453,
        "transactions": [
            tx("configure", EVALUATORS["ARL"], evaluator.encode_abi("configure", [job_id, cfg])),
            tx("setBudget", ESCROWS["ARL"], jobs.encode_abi("setBudget", [job_id, budget, b""])),
            tx("approve", TOKEN, erc20.encode_abi("approve", [spender, budget])),
            tx("fund", ESCROWS["ARL"], jobs.encode_abi("fund", [job_id, budget, b""])),
        ],
    }


def test_accepts_the_prepared_calls_for_this_task():
    assert check_create(TASK, "ARL", PROVIDER, create_answer(), NOW)["step"] == "createJob"
    steps = [
        t["step"] for t in check_funding(TASK, "ARL", TOKEN, 7, funding_answer(), COMMITTEE)
    ]
    assert steps == ["configure", "setBudget", "approve", "fund"]


@pytest.mark.parametrize(
    "answer",
    [
        create_answer(provider="0x6666666666666666666666666666666666666666"),
        create_answer(description="arl-task:0x" + "00" * 32 + " https://example.com/task.json"),
        create_answer(to="0x7777777777777777777777777777777777777777"),
        {**create_answer(), "chainId": 1},
        create_answer(expires=NOW + 3600),
    ],
)
def test_refuses_a_create_call_for_anything_else(answer):
    with pytest.raises(ArlError):
        check_create(TASK, "ARL", PROVIDER, answer, NOW)


@pytest.mark.parametrize(
    "answer",
    [
        funding_answer(job_id=8),
        funding_answer(budget=BUDGET + 1),
        funding_answer(spender="0x7777777777777777777777777777777777777777"),
        {**funding_answer(), "transactions": funding_answer()["transactions"][::-1]},
    ],
)
def test_refuses_funding_calls_that_move_other_money(answer):
    with pytest.raises(ArlError):
        check_funding(TASK, "ARL", TOKEN, 7, answer, COMMITTEE)


# Security report 2026-11-15: a tampered answer could configure another committee or terms.
@pytest.mark.parametrize(
    "answer",
    [
        funding_answer(committee=["0x" + "77" * 20] + COMMITTEE[1:]),
        funding_answer(committee=COMMITTEE[:2]),
        funding_answer(spec=bytes(32)),
        funding_answer(threshold=1),
        funding_answer(tier=0),
        funding_answer(vote=600),
        funding_answer(challenge=3600),
        funding_answer(bond=1),
        funding_answer(agent=5),
    ],
)
def test_refuses_a_configure_with_other_verification_terms(answer):
    with pytest.raises(ArlError):
        check_funding(TASK, "ARL", TOKEN, 7, answer, COMMITTEE)
