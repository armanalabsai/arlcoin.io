# Security audit, 17 October 2026

| File | Content |
| --- | --- |
| [report.md](report.md) / `report.pdf` | Final report |
| [scope.md](scope.md) | Contracts, commit, file hashes, deployment run check |
| [findings.md](findings.md) | Findings with severity, location and status |
| [triage.md](triage.md) | Every tool result and its verdict |
| `static/` | Slither and Aderyn: JSON, SARIF, Markdown |
| `dynamic/` | Foundry fuzz and invariant results (`forge test --json`) |
| `symbolic/` | Halmos and Mythril results |

The baseline that CI checks Aderyn against is [`../aderyn-baseline.json`](../aderyn-baseline.json).
