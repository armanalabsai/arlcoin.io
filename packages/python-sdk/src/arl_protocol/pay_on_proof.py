"""Pay on proof for Python services (spec/x402-arl-escrow): a paid HTTP endpoint whose payment is
held in a verified job until a staked committee has checked the result.

The service answers 402 with its offer. The caller opens and funds a job that matches the offer and
calls again with the ``X-ARL-Job`` header. The service checks the job on chain, does the work once
per job, and submits the deliverable as soon as enough committee members have accepted the job.

    paid = PayOnProof(private_key=KEY, offer=Offer(provider=ME, spec_uri=URI, spec_hash=HASH,
                                                   budget=10 * 10**18, committee=[A, B, C], threshold=2))

    @app.post("/run")                       # FastAPI; any framework works the same way
    async def run(request: Request):
        r = paid.handle(request.headers.get("x-arl-job"), lambda job: do_the_work(job))
        return Response(r.body, r.status, r.headers)

``do_the_work`` returns ``(body, deliverable)``: the response body and the 32-byte hash the
committee will check. Nothing here holds the caller's money: it stays in the escrow contract.
"""

from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from web3 import Web3

from .client import BASE_MAINNET_CHAIN_ID, DEFAULT_RPC, ESCROWS, EVALUATORS, ArlError, _fn

SCHEME = "arl-escrow"
JOB_HEADER = "X-ARL-Job"
DELIVERABLE_HEADER = "X-ARL-Deliverable"

# ARLJobs.JobStatus.Funded
_FUNDED = 1
# ARLVerifiedEvaluator member states (voteOf): accepted (2), voted (3, 4), absent (5).
_ACCEPTED = 2
_ABSENT = 5

_HEX32 = re.compile(r"^0x[0-9a-fA-F]{64}$")
_HEADER = re.compile(r"^(\d+):(0x[0-9a-fA-F]{40}):(\d+)$")

_JOB_TUPLE = {
    "name": "",
    "type": "tuple",
    "components": [
        {"name": n, "type": t}
        for n, t in (
            ("id", "uint256"),
            ("client", "address"),
            ("provider", "address"),
            ("evaluator", "address"),
            ("description", "string"),
            ("budget", "uint256"),
            ("expiredAt", "uint256"),
            ("status", "uint8"),
            ("hook", "address"),
        )
    ],
}
_CONFIG_TUPLE = {
    "name": "",
    "type": "tuple",
    "components": [
        {"name": n, "type": t}
        for n, t in (
            ("tier", "uint8"),
            ("threshold", "uint8"),
            ("voteWindow", "uint64"),
            ("challengeWindow", "uint64"),
            ("bond", "uint96"),
            ("providerAgentId", "uint256"),
            ("specHash", "bytes32"),
            ("committee", "address[]"),
        )
    ],
}
_JOBS_ABI = [
    {**_fn("getJob", [("jobId", "uint256")], [], "view"), "outputs": [_JOB_TUPLE]},
    _fn("submit", [("jobId", "uint256"), ("deliverable", "bytes32"), ("optParams", "bytes")]),
]
_EVALUATOR_ABI = [
    {**_fn("getConfig", [("jobId", "uint256")], [], "view"), "outputs": [_CONFIG_TUPLE]},
    _fn("approveCommittee", [("jobId", "uint256")]),
    _fn("voteOf", [("jobId", "uint256"), ("validator", "address")], ["uint8"], "view"),
]


@dataclass(frozen=True)
class Offer:
    """What the service asks for. ``budget`` and ``bond`` are in ARL base units (18 decimals)."""

    provider: str
    spec_uri: str
    spec_hash: str
    budget: int
    committee: list[str]
    threshold: int
    vote_window: int = 3_600
    challenge_window: int = 86_400
    bond: int = 100 * 10**18
    expires_in: int = 259_200
    chain_id: int = BASE_MAINNET_CHAIN_ID
    jobs: str = ESCROWS["ARL"]
    evaluator: str = EVALUATORS["ARL"]

    def __post_init__(self) -> None:
        if self.budget <= 0:
            raise ArlError("budget must be positive")
        if not _HEX32.match(self.spec_hash):
            raise ArlError("spec_hash must be 32 bytes")
        if not 3 <= len(self.committee) <= 7:
            raise ArlError("committee must have 3 to 7 validators")
        if len({c.lower() for c in self.committee}) != len(self.committee):
            raise ArlError("committee has duplicates")
        if not 1 <= self.threshold <= len(self.committee):
            raise ArlError("threshold must be between 1 and the committee size")

    def body(self) -> dict:
        """The 402 body (x402 version 2, scheme ``arl-escrow``)."""
        return {
            "x402Version": 2,
            "accepts": [
                {
                    "scheme": SCHEME,
                    "network": f"eip155:{self.chain_id}",
                    "amount": str(self.budget),
                    "payTo": Web3.to_checksum_address(self.provider),
                    "extra": {
                        "jobs": Web3.to_checksum_address(self.jobs),
                        "evaluator": Web3.to_checksum_address(self.evaluator),
                        "specUri": self.spec_uri,
                        "specHash": self.spec_hash,
                        "committee": [Web3.to_checksum_address(c) for c in self.committee],
                        "threshold": self.threshold,
                        "voteWindow": str(self.vote_window),
                        "challengeWindow": str(self.challenge_window),
                        "bond": str(self.bond),
                        "expiresIn": str(self.expires_in),
                    },
                }
            ],
        }


@dataclass(frozen=True)
class PaidJob:
    job_id: int
    client: str


@dataclass
class PaidResponse:
    """What to send back: copy ``status``, ``headers`` and ``body`` into your framework's response."""

    status: int
    body: bytes
    headers: dict[str, str] = field(default_factory=dict)


class MemoryUsedJobs:
    """Jobs already served, in memory. A service that restarts or runs several instances passes a
    durable store with the same three methods (has, add_if_new, delete) (a database table, Redis)."""

    def __init__(self) -> None:
        self._used: set[str] = set()
        self._lock = threading.Lock()

    def has(self, key: str) -> bool:
        with self._lock:
            return key in self._used

    def add_if_new(self, key: str) -> bool:
        with self._lock:
            if key in self._used:
                return False
            self._used.add(key)
            return True

    def delete(self, key: str) -> None:
        with self._lock:
            self._used.discard(key)


def _json(status: int, body: dict) -> PaidResponse:
    return PaidResponse(status, json.dumps(body).encode(), {"content-type": "application/json"})


def _to_bytes(body: Any) -> tuple[bytes, dict[str, str]]:
    if isinstance(body, bytes):
        return body, {}
    if isinstance(body, str):
        return body.encode(), {"content-type": "text/plain; charset=utf-8"}
    return json.dumps(body).encode(), {"content-type": "application/json"}


class PayOnProof:
    """One paid endpoint. ``private_key`` is the provider named in the offer; it only ever signs
    ``approveCommittee`` and ``submit`` for jobs that pay this service."""

    def __init__(
        self,
        *,
        private_key: str,
        offer: Offer,
        rpc_url: str = DEFAULT_RPC,
        used_jobs: MemoryUsedJobs | None = None,
        acceptance_timeout: float = 30 * 60,
        poll_seconds: float = 15,
        on_error: Callable[[Exception, int], None] | None = None,
        background: bool = True,
    ):
        self.offer = offer
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = self.w3.eth.account.from_key(private_key)
        if self.account.address.lower() != offer.provider.lower():
            raise ArlError("private_key is not the provider named in the offer")
        self.jobs = self.w3.eth.contract(address=Web3.to_checksum_address(offer.jobs), abi=_JOBS_ABI)
        self.evaluator = self.w3.eth.contract(
            address=Web3.to_checksum_address(offer.evaluator), abi=_EVALUATOR_ABI
        )
        self.used = used_jobs or MemoryUsedJobs()
        self.acceptance_timeout = acceptance_timeout
        self.poll_seconds = poll_seconds
        self.on_error = on_error
        self.background = background
        self._nonce_lock = threading.Lock()

    # ------------------------------------------------------------------ chain

    def check_funded_job(self, header: str | None) -> PaidJob:
        """Checks the job named by the header against the offer, before any work is done."""
        m = _HEADER.match(header or "")
        if not m:
            raise ArlError("missing or malformed X-ARL-Job header")
        chain = self.w3.eth.chain_id
        if int(m.group(1)) != chain or chain != self.offer.chain_id:
            raise ArlError("the job is on another chain")
        if m.group(2).lower() != self.offer.jobs.lower():
            raise ArlError("the job is in another escrow")
        job_id = int(m.group(3))
        job = self.jobs.functions.getJob(job_id).call()
        cfg = self.evaluator.functions.getConfig(job_id).call()
        _, client, provider, evaluator, _, budget, expired_at, status, _ = job
        _, threshold, vote_window, challenge_window, _, _, spec_hash, committee = cfg
        problems = []
        if status != _FUNDED:
            problems.append("not funded")
        if provider.lower() != self.offer.provider.lower():
            problems.append("another provider")
        if evaluator.lower() != self.offer.evaluator.lower():
            problems.append("another evaluator")
        if budget != self.offer.budget:
            problems.append("another budget")
        if "0x" + bytes(spec_hash).hex() != self.offer.spec_hash.lower():
            problems.append("another spec")
        if threshold != self.offer.threshold:
            problems.append("another threshold")
        if [c.lower() for c in committee] != [c.lower() for c in self.offer.committee]:
            problems.append("another committee")
        if problems:
            raise ArlError(f"job {job_id}: {', '.join(problems)}")
        # The vote window and two challenge windows must still fit before the deadline, or the
        # deadline could overtake the decision and return the escrow to the client.
        needed = vote_window + 2 * challenge_window
        if self.w3.eth.get_block("latest")["timestamp"] + needed > expired_at:
            raise ArlError(f"job {job_id}: too late, the evaluation needs {needed} s before the deadline")
        return PaidJob(job_id, Web3.to_checksum_address(client))

    def _send(self, call) -> str:
        try:
            call.call({"from": self.account.address})
        except Exception as error:  # the revert reason, before any gas is spent
            raise ArlError(str(error)) from error
        with self._nonce_lock:
            tx = call.build_transaction(
                {
                    "from": self.account.address,
                    "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                }
            )
            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt.status != 1:
            raise ArlError(f"transaction {tx_hash.hex()} reverted")
        return tx_hash.hex()

    def approve_committee(self, job_id: int) -> str:
        """As the provider: approves the committee, so the validators can accept the job."""
        return self._send(self.evaluator.functions.approveCommittee(job_id))

    def accepted_count(self, job_id: int) -> int:
        states = [self.evaluator.functions.voteOf(job_id, m).call() for m in self.offer.committee]
        return sum(1 for s in states if s >= _ACCEPTED and s != _ABSENT)

    def wait_for_acceptance(self, job_id: int) -> int:
        """Waits until ``threshold`` members accepted. Submitting earlier lets the job end
        undecided: the client is refunded and the service is not paid."""
        until = time.monotonic() + self.acceptance_timeout
        while True:
            accepted = self.accepted_count(job_id)
            if accepted >= self.offer.threshold:
                return accepted
            if time.monotonic() >= until:
                raise ArlError(f"job {job_id}: {accepted} of {self.offer.threshold} members accepted")
            time.sleep(self.poll_seconds)

    def submit_deliverable(self, job_id: int, deliverable: str) -> str:
        if not _HEX32.match(deliverable):
            raise ArlError("deliverable must be 32 bytes")
        accepted = self.accepted_count(job_id)
        if accepted < self.offer.threshold:
            raise ArlError(
                f"job {job_id}: only {accepted} of {self.offer.threshold} members accepted;"
                " submit after wait_for_acceptance"
            )
        return self._send(self.jobs.functions.submit(job_id, bytes.fromhex(deliverable[2:]), b""))

    # ------------------------------------------------------------------ HTTP

    def _key(self, job_id: int) -> str:
        return f"eip155:{self.offer.chain_id}:{self.offer.jobs}:{job_id}".lower()

    def handle(
        self, job_header: str | None, work: Callable[[PaidJob], tuple[Any, str]]
    ) -> PaidResponse:
        """Serves one request. ``work(job)`` returns ``(body, deliverable)`` and runs at most once
        per job. ``body`` may be bytes, a string, or anything JSON can encode."""
        offer_body = self.offer.body()
        if not job_header:
            return _json(402, offer_body)
        # A job that was already served is refused whatever state it has reached since.
        m = _HEADER.match(job_header)
        if m and self.used.has(self._key(int(m.group(3)))):
            return _json(409, {"error": "this job was already served"})
        try:
            job = self.check_funded_job(job_header)
        except ArlError as error:
            return _json(402, {**offer_body, "error": str(error).split("\n")[0]})
        except Exception:  # an RPC or library error stays on the server
            return _json(402, {**offer_body, "error": "could not check the job"})

        # One run per job: recorded before the work, released only if the work never started.
        key = self._key(job.job_id)
        if not self.used.add_if_new(key):
            return _json(409, {"error": "this job was already served"})
        try:
            self.approve_committee(job.job_id)
        except Exception:
            self.used.delete(key)
            return _json(503, {"error": "could not approve the committee: try again"})

        body, deliverable = work(job)
        if not isinstance(deliverable, str) or not _HEX32.match(deliverable):
            raise ArlError("work must return a 32-byte deliverable")

        def submit() -> None:
            try:
                self.wait_for_acceptance(job.job_id)
                self.submit_deliverable(job.job_id, deliverable)
            except Exception as error:  # the job then ends refunded to the client
                if self.on_error is not None:
                    self.on_error(error, job.job_id)

        if self.background:
            threading.Thread(target=submit, daemon=True).start()
        else:
            submit()

        data, headers = _to_bytes(body)
        headers[JOB_HEADER] = job_header
        headers[DELIVERABLE_HEADER] = deliverable
        return PaidResponse(200, data, headers)
