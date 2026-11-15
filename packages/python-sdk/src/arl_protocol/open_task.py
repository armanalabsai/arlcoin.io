"""Open an arl-task/1 task as a verified job, from Python.

The Agent API (https://arlcoin.io/api/v1) validates the task against its policy and prepares the
unsigned transactions; this module checks every transaction against the task and the known Base
Mainnet addresses before the wallet signs it, so a wrong or tampered answer is refused, never
sent. The same calls are what `openTask` sends in the TypeScript SDK.

    from arl_protocol import Arl

    arl = Arl(private_key=os.environ["ARL_WALLET_KEY"])
    opened = arl.open_task(task, task_uri="https://example.com/task.json",
                           provider="0xProvider", committee=["0xV1", "0xV2", "0xV3"])
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any, Callable

from web3 import Web3

from .client import ERC20_ABI, ESCROWS, JOBS_ABI, ArlError
from .task import task_hash

AGENT_API = "https://arlcoin.io/api/v1"

#: The verified evaluator bound to each escrow on Base Mainnet (docs/mainnet-services.md).
EVALUATORS = {
    "ARL": "0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF",
    "USDC": "0x8C017f24615AC749Ec7297FB07b14E558B670CFC",
}

CONFIGURE_ABI = [
    {
        "type": "function",
        "name": "configure",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "jobId", "type": "uint256"},
            {
                "name": "cfg",
                "type": "tuple",
                "components": [
                    {"name": "tier", "type": "uint8"},
                    {"name": "threshold", "type": "uint8"},
                    {"name": "voteWindow", "type": "uint64"},
                    {"name": "challengeWindow", "type": "uint64"},
                    {"name": "bond", "type": "uint96"},
                    {"name": "providerAgentId", "type": "uint256"},
                    {"name": "specHash", "type": "bytes32"},
                    {"name": "committee", "type": "address[]"},
                ],
            },
        ],
        "outputs": [],
    }
]

Post = Callable[[str, dict], dict]


def http_post(url: str, body: dict) -> dict:
    """POST JSON, return JSON; an API refusal (4xx/5xx) becomes ArlError with its reason."""
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "user-agent": "arl-protocol-python/0.2.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 (https only)
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            reason = json.loads(error.read()).get("error", str(error))
        except Exception:  # pragma: no cover - a non-JSON error body
            reason = str(error)
        raise ArlError(reason) from error


def _same(a: str, b: str) -> bool:
    return Web3.to_checksum_address(a) == Web3.to_checksum_address(b)


def check_create(task: dict, token: str, provider: str, answer: dict) -> dict:
    """The createJob transaction, after checking it opens exactly this task on the ARL escrow."""
    txs = answer.get("transactions") or []
    if answer.get("chainId") != 8453 or len(txs) != 1 or txs[0].get("step") != "createJob":
        raise ArlError("the API did not return one createJob transaction for Base Mainnet")
    tx = txs[0]
    if not _same(tx["to"], ESCROWS[token]) or str(tx.get("value", "0")) != "0":
        raise ArlError("createJob does not go to ARL's escrow, or sends value")
    jobs = Web3().eth.contract(address=ESCROWS[token], abi=JOBS_ABI)
    fn, args = jobs.decode_function_input(tx["data"])
    if fn.fn_name != "createJob":
        raise ArlError("the transaction is not createJob")
    if not _same(args["provider"], provider) or not _same(args["evaluator"], EVALUATORS[token]):
        raise ArlError("createJob names another provider or evaluator")
    if not args["description"].startswith(f"arl-task:{task_hash(task)} "):
        raise ArlError("createJob does not carry this task's hash")
    return tx


def check_funding(task: dict, token: str, token_address: str, job_id: int, answer: dict) -> list:
    """configure, setBudget, approve and fund for `job_id`, checked against the task."""
    txs = answer.get("transactions") or []
    steps = [t.get("step") for t in txs]
    if answer.get("chainId") != 8453 or steps != ["configure", "setBudget", "approve", "fund"]:
        raise ArlError("the API did not return configure, setBudget, approve and fund")
    budget = int(task["payment"]["budget"])
    w3 = Web3()
    jobs = w3.eth.contract(address=ESCROWS[token], abi=JOBS_ABI)
    evaluator = w3.eth.contract(address=EVALUATORS[token], abi=CONFIGURE_ABI)
    erc20 = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    expected = {
        "configure": (EVALUATORS[token], evaluator),
        "setBudget": (ESCROWS[token], jobs),
        "approve": (token_address, erc20),
        "fund": (ESCROWS[token], jobs),
    }
    for tx in txs:
        to, contract = expected[tx["step"]]
        if not _same(tx["to"], to) or str(tx.get("value", "0")) != "0":
            raise ArlError(f"{tx['step']} goes to an unexpected address or sends value")
        fn, args = contract.decode_function_input(tx["data"])
        if fn.fn_name != tx["step"]:
            raise ArlError(f"{tx['step']} encodes another call ({fn.fn_name})")
        if tx["step"] == "approve":
            if not _same(args["spender"], ESCROWS[token]) or args["amount"] != budget:
                raise ArlError("approve is not exactly the budget for ARL's escrow")
        elif args["jobId"] != job_id:
            raise ArlError(f"{tx['step']} is for another job")
        elif tx["step"] in ("setBudget", "fund"):
            amount = args["amount"] if tx["step"] == "setBudget" else args["expectedBudget"]
            if amount != budget:
                raise ArlError(f"{tx['step']} is not the task's budget")
    return txs


def open_task(
    arl: Any,
    task: dict,
    task_uri: str,
    provider: str,
    committee: list,
    api_url: str = AGENT_API,
    post: Post = http_post,
) -> dict:
    """Opens and funds `task` as a verified job from `arl`'s wallet. See the module docstring."""
    token = (task.get("payment") or {}).get("token")
    if token not in ESCROWS:
        raise ArlError('the task must be paid in "ARL" or "USDC"')
    if not _same(arl.jobs.address, ESCROWS[token]):
        raise ArlError(f"this task is paid in {token}: use Arl(..., token={token!r})")
    arl._check_chain()
    body = {
        "task": task,
        "taskUri": task_uri,
        "client": arl.address,
        "provider": provider,
        "committee": committee,
    }
    create = check_create(task, token, provider, post(f"{api_url}/jobs/prepare", body))
    receipt = arl._send_raw(create["to"], create["data"])
    events = arl.jobs.events.JobCreated().process_receipt(receipt)
    if not events:
        raise ArlError("the job was created but its id could not be read")
    job_id = int(events[0]["args"]["jobId"])
    # The API reads the chain through public RPCs that can lag a block behind the new job.
    for attempt in range(5):
        try:
            answer = post(f"{api_url}/jobs/prepare-funding", {**body, "jobId": str(job_id)})
            break
        except ArlError as error:
            if attempt == 4 or "does not exist" not in str(error):
                raise
            time.sleep(3)
    txs = check_funding(task, token, arl.token.address, job_id, answer)
    hashes = {"createJob": receipt.transactionHash.hex()}
    for tx in txs:
        hashes[tx["step"]] = arl._send_raw(tx["to"], tx["data"]).transactionHash.hex()
    return {"job_id": job_id, "task_hash": task_hash(task), "transactions": hashes}
