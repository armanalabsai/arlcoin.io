"""Pay on proof without a chain: the offer, and the order of the checks around the work."""

import json

import pytest

from arl_protocol import ArlError, MemoryUsedJobs, Offer, PaidJob, PayOnProof
from arl_protocol.pay_on_proof import DELIVERABLE_HEADER, JOB_HEADER

# Anvil development account 1 (a public test key).
KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
PROVIDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
COMMITTEE = [f"0x{i:040x}" for i in (11, 12, 13)]
SPEC = "0x" + "5a" * 32
DELIVERABLE = "0x" + "d1" * 32
HEADER = "8453:0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC:7"


def offer(**changes):
    values = dict(
        provider=PROVIDER,
        spec_uri="https://example.org/spec.json",
        spec_hash=SPEC,
        budget=10 * 10**18,
        committee=COMMITTEE,
        threshold=2,
    )
    return Offer(**{**values, **changes})


class Offline(PayOnProof):
    """The service with its chain calls replaced; records what it would have sent."""

    def __init__(self, funded=True, approve_fails=False, **kw):
        super().__init__(private_key=KEY, offer=offer(), background=False, **kw)
        self.funded, self.approve_fails, self.calls = funded, approve_fails, []

    def check_funded_job(self, header):
        self.calls.append("check")
        if not self.funded:
            raise ArlError("job 7: not funded\nand a detail that stays on the server")
        return PaidJob(7, "0x00000000000000000000000000000000000000C1")

    def approve_committee(self, job_id):
        self.calls.append("approve")
        if self.approve_fails:
            raise ArlError("rpc down")
        return "0x01"

    def wait_for_acceptance(self, job_id):
        self.calls.append("wait")
        return 2

    def submit_deliverable(self, job_id, deliverable):
        self.calls.append(f"submit {deliverable}")
        return "0x02"


def test_the_offer_is_an_x402_arl_escrow_body():
    accepts = offer().body()["accepts"][0]
    assert offer().body()["x402Version"] == 2
    assert accepts["scheme"] == "arl-escrow" and accepts["network"] == "eip155:8453"
    assert accepts["amount"] == str(10 * 10**18) and accepts["payTo"] == PROVIDER
    extra = accepts["extra"]
    assert extra["jobs"] == "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC"
    assert extra["evaluator"] == "0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28"
    assert extra["specHash"] == SPEC and extra["threshold"] == 2
    assert extra["challengeWindow"] == "86400" and extra["bond"] == str(100 * 10**18)


@pytest.mark.parametrize(
    "changes",
    [
        {"budget": 0},
        {"spec_hash": "0x1234"},
        {"committee": COMMITTEE[:2]},
        {"committee": [COMMITTEE[0], COMMITTEE[0], COMMITTEE[1]]},
        {"threshold": 4},
        {"threshold": 0},
    ],
)
def test_a_wrong_offer_is_refused_when_it_is_built(changes):
    with pytest.raises(ArlError):
        offer(**changes)


def test_the_key_must_be_the_provider_of_the_offer():
    with pytest.raises(ArlError):
        PayOnProof(private_key=KEY, offer=offer(provider=COMMITTEE[0]))


def test_without_a_job_the_answer_is_402_with_the_terms_and_no_work():
    paid = Offline()
    answer = paid.handle(None, lambda job: pytest.fail("worked without payment"))
    assert answer.status == 402 and paid.calls == []
    assert json.loads(answer.body)["accepts"][0]["scheme"] == "arl-escrow"


def test_a_job_that_does_not_match_is_402_with_the_first_line_of_the_reason():
    paid = Offline(funded=False)
    answer = paid.handle(HEADER, lambda job: pytest.fail("worked without payment"))
    body = json.loads(answer.body)
    assert answer.status == 402 and body["error"] == "job 7: not funded"
    assert paid.calls == ["check"]


def test_a_funded_job_is_served_once_and_the_deliverable_is_submitted_after_acceptance():
    paid = Offline()
    seen = []

    def work(job):
        seen.append(job)
        return {"ok": True}, DELIVERABLE

    answer = paid.handle(HEADER, work)
    assert answer.status == 200 and json.loads(answer.body) == {"ok": True}
    assert answer.headers[JOB_HEADER] == HEADER and answer.headers[DELIVERABLE_HEADER] == DELIVERABLE
    assert seen == [PaidJob(7, "0x00000000000000000000000000000000000000C1")]
    # The committee is approved before the work; the deliverable waits for acceptance.
    assert paid.calls == ["check", "approve", "wait", f"submit {DELIVERABLE}"]

    again = paid.handle(HEADER, work)
    assert again.status == 409 and len(seen) == 1
    # The second request is refused without another chain read.
    assert paid.calls == ["check", "approve", "wait", f"submit {DELIVERABLE}"]


def test_a_failed_approval_releases_the_job_so_the_caller_can_try_again():
    paid = Offline(approve_fails=True)
    answer = paid.handle(HEADER, lambda job: pytest.fail("worked before approval"))
    assert answer.status == 503
    paid.approve_fails = False
    assert paid.handle(HEADER, lambda job: ("done", DELIVERABLE)).status == 200


def test_work_must_return_a_32_byte_deliverable():
    with pytest.raises(ArlError):
        Offline().handle(HEADER, lambda job: ("done", "0x1234"))


def test_bodies_keep_their_type():
    text = Offline().handle(HEADER, lambda job: ("plain", DELIVERABLE))
    assert text.body == b"plain" and text.headers["content-type"].startswith("text/plain")
    raw = Offline().handle(HEADER, lambda job: (b"\x00\x01", DELIVERABLE))
    assert raw.body == b"\x00\x01" and "content-type" not in raw.headers


def test_a_failed_submission_is_reported_and_does_not_break_the_answer():
    errors = []

    class NoQuorum(Offline):
        def wait_for_acceptance(self, job_id):
            raise ArlError("job 7: 1 of 2 members accepted")

    paid = NoQuorum(on_error=lambda error, job_id: errors.append((str(error), job_id)))
    assert paid.handle(HEADER, lambda job: ("done", DELIVERABLE)).status == 200
    assert errors == [("job 7: 1 of 2 members accepted", 7)]


def test_a_shared_store_refuses_a_job_served_by_another_instance():
    store = MemoryUsedJobs()
    assert Offline(used_jobs=store).handle(HEADER, lambda job: ("a", DELIVERABLE)).status == 200
    assert Offline(used_jobs=store).handle(HEADER, lambda job: ("b", DELIVERABLE)).status == 409
