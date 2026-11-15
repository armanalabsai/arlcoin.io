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
from arl_protocol.task import task_hash

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
w3 = Web3()
jobs = w3.eth.contract(address=ESCROWS["ARL"], abi=JOBS_ABI)
evaluator = w3.eth.contract(address=EVALUATORS["ARL"], abi=CONFIGURE_ABI)
erc20 = w3.eth.contract(address=TOKEN, abi=ERC20_ABI)


def tx(step, to, data):
    return {"step": step, "to": to, "data": data, "value": "0"}


def create_answer(provider=PROVIDER, description=None, to=ESCROWS["ARL"]):
    description = description or f"arl-task:{task_hash(TASK)} https://example.com/task.json"
    data = jobs.encode_abi(
        "createJob", [provider, EVALUATORS["ARL"], 1_800_259_200, description, "0x" + "00" * 20]
    )
    return {"chainId": 8453, "transactions": [tx("createJob", to, data)]}


def funding_answer(job_id=7, budget=BUDGET, spender=ESCROWS["ARL"]):
    cfg = (1, 2, 21600, 86400, 10**20, 0, bytes(32), COMMITTEE)
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
    assert check_create(TASK, "ARL", PROVIDER, create_answer())["step"] == "createJob"
    steps = [t["step"] for t in check_funding(TASK, "ARL", TOKEN, 7, funding_answer())]
    assert steps == ["configure", "setBudget", "approve", "fund"]


@pytest.mark.parametrize(
    "answer",
    [
        create_answer(provider="0x6666666666666666666666666666666666666666"),
        create_answer(description="arl-task:0x" + "00" * 32 + " https://example.com/task.json"),
        create_answer(to="0x7777777777777777777777777777777777777777"),
        {**create_answer(), "chainId": 1},
    ],
)
def test_refuses_a_create_call_for_anything_else(answer):
    with pytest.raises(ArlError):
        check_create(TASK, "ARL", PROVIDER, answer)


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
        check_funding(TASK, "ARL", TOKEN, 7, answer)
