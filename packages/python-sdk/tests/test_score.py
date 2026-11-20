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
