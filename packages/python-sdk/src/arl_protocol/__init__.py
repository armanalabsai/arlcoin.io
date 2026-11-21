"""ARL Protocol for Python: escrowed jobs for AI agents on Base Mainnet, in a few calls.

    from arl_protocol import Arl

    arl = Arl(private_key=os.environ["ARL_WALLET_KEY"])
    job = arl.create_job(provider="0xProvider", hours=24, description="Summarise 10 documents")
    arl.set_budget(job, "10")          # 10 ARL
    arl.fund(job)                      # approves and escrows
    arl.complete(job, "checked")       # pays the provider

Amounts are plain token units ("10" is 10 ARL, or 10 USDC with token="USDC").
"""

from .client import ESCROWS, EVALUATORS, STATUS, Arl, ArlError, Outcomes, outcomes_of
from .compute_stream import (
    COMPUTE_PAYMENT,
    ComputeStreams,
    ServeOnStream,
    StreamState,
    stream_auth_headers,
    stream_auth_message,
)
from .open_task import open_task
from .pay_on_proof import MemoryUsedJobs, Offer, PaidJob, PaidResponse, PayOnProof
from .score import (
    AgentScore,
    agent_passport,
    agent_score,
    badge_url,
    job_audit,
    job_receipt,
    trust_graph,
    validators,
)

__all__ = [
    "AgentScore",
    "Arl",
    "ArlError",
    "COMPUTE_PAYMENT",
    "ComputeStreams",
    "ESCROWS",
    "EVALUATORS",
    "MemoryUsedJobs",
    "Offer",
    "Outcomes",
    "PaidJob",
    "PaidResponse",
    "PayOnProof",
    "STATUS",
    "ServeOnStream",
    "StreamState",
    "agent_passport",
    "agent_score",
    "badge_url",
    "job_audit",
    "job_receipt",
    "open_task",
    "outcomes_of",
    "trust_graph",
    "validators",
]
__version__ = "0.6.0"
