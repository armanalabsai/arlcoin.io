"""An agent's ARL score (arl-reputation/1), read from the Agent API. No key and no RPC needed.

    from arl_protocol import agent_score, badge_url

    score = agent_score(42)
    print(score.score_bps, score.completed, len(score.outcomes))
    print(badge_url(42))   # an SVG for a README or a page

The score counts verified outcomes only: jobs a staked committee approved or rejected, and jobs
the agent took and let expire. `score_bps` runs from 0 to 10000 and is None until the agent has
3 outcomes from 2 distinct clients.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

from .client import ArlError

AGENT_API = "https://arlcoin.io/api/v1"

Get = Callable[[str], dict]


def http_get(url: str) -> dict:
    """GET JSON; an API refusal (4xx/5xx) becomes ArlError with its reason."""
    if not url.startswith("https://") and not url.startswith("http://localhost"):
        raise ArlError("the Agent API must be reached over https")
    request = urllib.request.Request(url, headers={"user-agent": "arl-protocol-python"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 (checked above)
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            reason = json.loads(error.read()).get("error", str(error))
        except Exception:  # pragma: no cover - a non-JSON error body
            reason = str(error)
        raise ArlError(reason) from error


@dataclass(frozen=True)
class AgentScore:
    agent_id: int
    #: The Base Mainnet block everything was read at.
    block: int
    #: 0 to 10000, or None below 3 outcomes from 2 distinct clients.
    score_bps: int | None
    clients: int
    completed: int
    rejected: int
    expired: int
    disputed: int
    #: The outcomes the score was computed from, oldest first.
    outcomes: list[dict] = field(default_factory=list)
    #: Records that could not be joined to a job, with the reason. Never guessed.
    skipped: list[dict] = field(default_factory=list)


def _agent_id(agent_id: int) -> int:
    if isinstance(agent_id, bool) or not isinstance(agent_id, int) or agent_id < 0:
        raise ArlError("agent_id must be a non-negative integer")
    return agent_id


def agent_score(agent_id: int, *, api_url: str = AGENT_API, get: Get = http_get) -> AgentScore:
    """Reads an ERC-8004 agent's arl-reputation/1 score and the outcomes behind it."""
    body = get(f"{api_url}/agents/{_agent_id(agent_id)}/score")
    if body.get("version") != "arl-reputation/1" or not isinstance(body.get("outcomes"), list):
        raise ArlError("the API did not return an arl-reputation/1 score")
    score = body.get("score_bps")
    if score is not None and (isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 10_000):
        raise ArlError("the API returned a score outside 0 to 10000")
    return AgentScore(
        agent_id=agent_id,
        block=int(body["block"]),
        score_bps=score,
        clients=int(body["clients"]),
        completed=int(body["completed"]),
        rejected=int(body["rejected"]),
        expired=int(body["expired"]),
        disputed=int(body["disputed"]),
        outcomes=body["outcomes"],
        skipped=body.get("skipped", []),
    )


def badge_url(agent_id: int, *, api_url: str = AGENT_API) -> str:
    """The address of the agent's "ARL verified" SVG badge, for a README or a page."""
    return f"{api_url}/agents/{_agent_id(agent_id)}/badge.svg"


def _token(token: str) -> str:
    if token not in ("ARL", "USDC"):
        raise ArlError('token must be "ARL" or "USDC"')
    return token


def _job_id(job_id: int) -> int:
    if isinstance(job_id, bool) or not isinstance(job_id, int) or job_id < 1:
        raise ArlError("job_id must be a positive integer")
    return job_id


def _answer(body: dict, key: str, kind: type) -> dict:
    """An Agent API answer is used only when it names its block and carries what was asked for."""
    if not isinstance(body, dict) or not str(body.get("block", "")).isdigit() or not isinstance(body.get(key), kind):
        raise ArlError(f"the API did not return {key}")
    return body


def agent_passport(agent_id: int, *, api_url: str = AGENT_API, get: Get = http_get) -> dict:
    """An ERC-8004 agent's identity and verified record in one answer.

    `registered`, `owner`, and the `name` and `description` its owner states (untrusted text),
    with its arl-reputation/1 score fields and `outcomes`.
    """
    body = get(f"{api_url}/agents/{_agent_id(agent_id)}")
    if not isinstance(body, dict) or not isinstance(body.get("registered"), bool):
        raise ArlError("the API did not return an agent passport")
    return _answer(body, "outcomes", list)


def job_audit(job_id: int, *, token: str = "ARL", api_url: str = AGENT_API, get: Get = http_get) -> list[dict]:
    """Every on-chain event of a verified job, oldest first.

    Each entry has `step` (one sentence), `event`, `contract`, `block`, `at` (Unix seconds),
    `transaction`, `actor` where the event names one, and `detail`.
    """
    body = get(f"{api_url}/jobs/{_token(token)}/{_job_id(job_id)}/audit")
    return _answer(body, "entries", list)["entries"]


def job_receipt(job_id: int, *, token: str = "ARL", api_url: str = AGENT_API, get: Get = http_get) -> dict:
    """A finalized job's portable receipt and the unsigned EAS call that records it.

    `receipt` is None while the job is not finalized. `attest` (and `registerSchema`, while the
    schema is not on EAS) are unsigned transactions for the caller's own wallet: nothing is sent.
    """
    body = get(f"{api_url}/jobs/{_token(token)}/{_job_id(job_id)}/receipt")
    if not isinstance(body, dict) or "receipt" not in body:
        raise ArlError("the API did not return a receipt")
    return _answer(body, "schemaUid", str)


def validators(*, api_url: str = AGENT_API, get: Get = http_get) -> list[dict]:
    """Every validator that staked on a verified evaluator, most active first.

    Each has `token`, `validator`, `stake` and `locked` (base units), `accepted`, `approved`,
    `rejected`, `slashes`, `slashed` and `since`.
    """
    return _answer(get(f"{api_url}/validators"), "validators", list)["validators"]


def trust_graph(*, api_url: str = AGENT_API, get: Get = http_get) -> dict:
    """Who hired whom, and how it ended: `agents` with their scores and `edges` per client and agent."""
    body = _answer(get(f"{api_url}/graph"), "edges", list)
    if not isinstance(body.get("agents"), list):
        raise ArlError("the API did not return agents")
    return body
