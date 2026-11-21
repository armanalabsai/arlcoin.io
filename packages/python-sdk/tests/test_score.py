"""agent_score: the Agent API's answer is checked before it is handed on. No network."""

import pytest

from arl_protocol import AgentScore, ArlError, agent_score, badge_url

ANSWER = {
    "chainId": 8453,
    "block": "60100000",
    "agentId": "42",
    "version": "arl-reputation/1",
    "score_bps": 9100,
    "clients": 2,
    "completed": 3,
    "rejected": 1,
    "expired": 0,
    "disputed": 0,
    "outcomes": [{"job": "0xabc:1", "outcome": "completed"}],
    "skipped": [],
}


def test_reads_a_score():
    asked = []
    score = agent_score(42, get=lambda url: asked.append(url) or ANSWER)
    assert asked == ["https://arlcoin.io/api/v1/agents/42/score"]
    assert isinstance(score, AgentScore)
    assert (score.score_bps, score.completed, score.rejected, score.clients) == (9100, 3, 1, 2)
    assert score.block == 60_100_000
    assert score.outcomes[0]["outcome"] == "completed"


def test_no_score_below_the_minimum():
    score = agent_score(7, get=lambda _: {**ANSWER, "score_bps": None, "outcomes": []})
    assert score.score_bps is None
    assert score.outcomes == []


@pytest.mark.parametrize(
    "answer",
    [
        {**ANSWER, "version": "something-else/1"},
        {**ANSWER, "outcomes": "none"},
        {**ANSWER, "score_bps": 10_001},
        {**ANSWER, "score_bps": True},
    ],
)
def test_refuses_an_answer_that_is_not_a_score(answer):
    with pytest.raises(ArlError):
        agent_score(42, get=lambda _: answer)


@pytest.mark.parametrize("agent_id", [-1, "42", 1.5, True])
def test_refuses_a_bad_agent_id(agent_id):
    with pytest.raises(ArlError):
        agent_score(agent_id, get=lambda _: ANSWER)
    with pytest.raises(ArlError):
        badge_url(agent_id)


def test_badge_url():
    assert badge_url(42) == "https://arlcoin.io/api/v1/agents/42/badge.svg"


# --- the other reads of the verified record -------------------------------------------------

from arl_protocol import agent_passport, job_audit, job_receipt, trust_graph, validators  # noqa: E402

BLOCK = {"chainId": 8453, "block": "60100000"}


def test_reads_name_their_route_and_return_what_was_asked():
    asked = []

    def get(url):
        asked.append(url.removeprefix("https://arlcoin.io/api/v1"))
        return {
            **BLOCK,
            "registered": True,
            "outcomes": [],
            "entries": [{"event": "JobCreated"}],
            "receipt": None,
            "schemaUid": "0x" + "ab" * 32,
            "validators": [{"validator": "0x" + "12" * 20}],
            "agents": [],
            "edges": [],
        }

    assert agent_passport(7, get=get)["registered"] is True
    assert job_audit(3, get=get) == [{"event": "JobCreated"}]
    assert job_audit(3, token="USDC", get=get)
    assert job_receipt(3, get=get)["receipt"] is None
    assert validators(get=get)[0]["validator"].startswith("0x")
    assert trust_graph(get=get)["edges"] == []
    assert asked == [
        "/agents/7",
        "/jobs/ARL/3/audit",
        "/jobs/USDC/3/audit",
        "/jobs/ARL/3/receipt",
        "/validators",
        "/graph",
    ]


@pytest.mark.parametrize(
    "call",
    [
        lambda get: agent_passport(1, get=get),
        lambda get: job_audit(1, get=get),
        lambda get: job_receipt(1, get=get),
        lambda get: validators(get=get),
        lambda get: trust_graph(get=get),
    ],
)
def test_refuses_an_answer_without_what_was_asked(call):
    for answer in ({"error": "chain read failed"}, {"block": "x"}, {**BLOCK}, []):
        with pytest.raises(ArlError):
            call(lambda _url, a=answer: a)


def test_refuses_bad_job_arguments():
    for bad in (0, -1, "1", 1.0, True):
        with pytest.raises(ArlError):
            job_audit(bad, get=lambda _: {})
    with pytest.raises(ArlError):
        job_audit(1, token="DAI", get=lambda _: {})
