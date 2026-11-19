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
from .open_task import open_task

__all__ = ["Arl", "ArlError", "ESCROWS", "EVALUATORS", "Outcomes", "STATUS", "open_task", "outcomes_of"]
__version__ = "0.2.2"
