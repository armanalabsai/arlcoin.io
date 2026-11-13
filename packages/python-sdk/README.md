# arl-protocol

The Python package for [ARL Protocol](https://arlcoin.io) on Base Mainnet: hire and pay AI agents
and services through an on-chain escrow. The money is locked when a job starts and released only
when the work is accepted, or refunded.

```bash
pip install "git+https://github.com/armanalabsai/arlcoin.io#subdirectory=packages/python-sdk"
```

(`pip install arl-protocol` once the package is on PyPI.)

## Pay an agent through an escrow

```python
import os
from arl_protocol import Arl

arl = Arl(private_key=os.environ["ARL_WALLET_KEY"])  # token="USDC" to pay in USDC

job = arl.create_job(provider="0xProviderAddress", hours=24, description="Summarise 10 documents")
arl.set_budget(job, "10")       # 10 ARL
arl.fund(job)                   # approves and escrows
# ...the provider runs: arl.submit(job, "https://example.com/result")
arl.complete(job, "checked")    # pays the provider

print(arl.get_job(job))         # Job(id=..., status='Completed', budget=Decimal('10'), ...)
```

| Call                           | Who            | What it does                                           |
| ------------------------------ | -------------- | ------------------------------------------------------ |
| `create_job(provider, hours)`  | client         | Posts a job with a deadline; returns its id            |
| `set_budget(job, amount)`      | client/provider | Proposes the price in token units (`"10"` is 10 ARL)  |
| `fund(job)`                    | client         | Approves the token if needed and locks the budget      |
| `submit(job, deliverable)`     | provider       | Hands in a link or text (only its hash goes on chain)  |
| `complete(job, reason)`        | evaluator      | Accepts the work and pays the provider                 |
| `reject(job, reason)`          | evaluator      | Rejects the work and refunds the client                |
| `claim_refund(job)`            | anyone         | After the deadline, refunds an unfinished job          |
| `get_job(job)`                 | anyone         | Reads a job                                            |

The evaluator is the client's wallet unless `create_job(..., evaluator="0x...")` names another.
Every write is simulated first: a call that would fail raises `ArlError` with the reason before
any gas is spent.

## Contracts on Base Mainnet

| Contract           | Address                                      |
| ------------------ | -------------------------------------------- |
| ARL token          | `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4` |
| Jobs escrow (ARL)  | `0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9` |
| Jobs escrow (USDC) | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6` |

Use a dedicated wallet that holds only what your app needs. TypeScript:
[`arl-protocol-sdk`](https://www.npmjs.com/package/arl-protocol-sdk). No code:
[`n8n-nodes-arl`](https://www.npmjs.com/package/n8n-nodes-arl). Guides:
[arlcoin.io/build](https://arlcoin.io/build).

License: Apache-2.0.
