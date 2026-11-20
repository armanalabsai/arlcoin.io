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
