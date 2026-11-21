# Changelog

Notable changes to ARL Protocol, newest first. Dates are UTC. Every entry links to the code and
documents that back it. What is deployed on Base Mainnet is recorded in
[docs/mainnet-services.md](docs/mainnet-services.md) and `contracts/deploy/`.

## 2026-11-21

- Status lines of [jobs.md](docs/jobs.md), [compute-streaming.md](docs/compute-streaming.md) and
  [verifiable-execution.md](docs/verifiable-execution.md) state what runs on Base Mainnet; they
  still described the testnet stage.
- The Core page shows the same turning logo as the landing page and the app
  ([CoreCard.tsx](apps/web/src/core/CoreCard.tsx)).
- arl-protocol 0.5.0 (Python): `PayOnProof`, so a FastAPI, Flask or Django service can be paid
  through a verified job as the TypeScript `payOnProof` does. Tested end to end on a local fork of
  Base Mainnet against the live escrow and evaluator
  ([pay_on_proof.py](packages/python-sdk/src/arl_protocol/pay_on_proof.py),
  [fork test](packages/python-sdk/tests/test_pay_on_proof_fork.py)).
- [arlcoin.io/proof](https://arlcoin.io/proof/): every working part, how it works and where to
  check it on Base Mainnet, with a 78-second video and a plain list of what is not proven yet
  ([page.tsx](apps/web/app/proof/page.tsx)).
- The home page animation says Base produces about five blocks a second, as it does now, not one
  every two seconds.
- arl-protocol-sdk 0.3.3: the same code as 0.3.2, published so that the `latest` tag on npm points
  at the current version again (an older staged 0.3.0 had taken it).
- arl-protocol-sdk 0.3.2 and arl-protocol-mcp 0.2.1: `getJobReceipt` and `arl_get_job_receipt`,
  the portable job receipt that the Agent API already serves, so the npm packages match their
  documentation.
- Search descriptions: every page of arlcoin.io has its own description of useful length; the
  sitemap no longer lists the app, which asks not to be indexed.
- The home page timeline adds two phases, the trust layer (done) and the first paid services
  (under way), and names the audit as the internal audit it is
  ([roadmap.ts](apps/web/src/content/layers/roadmap.ts)).
- The app (arlcoin.io/app) shows the turning ARL logo of the landing page as a fixed backdrop
  behind its panels ([BackdropLogo.tsx](apps/dapp/components/arl/BackdropLogo.tsx)).
- The "Works where your agents work" diagram on the home page adds XSpaceSI and DeepSeek, reached through the
  HTTP Agent API ([AgentNetwork.tsx](apps/web/src/site/AgentNetwork.tsx)).
- arl-protocol-sdk 0.3.1: `getValidators`, on top of 0.3.0's `payOnProof`, `getAgentScore`,
  `getAgentPassport`, `getTrustGraph` and `getJobAudit`.
- The Agent API reads the verified history from a snapshot published every ten minutes
  ([History snapshot workflow](.github/workflows/history-snapshot.yml)); its answers name the
  block they were read at.
- Portable job receipts: a finalized job's record as an Ethereum Attestation Service schema, with
  the unsigned `attest` call for the provider's own wallet. `getJobReceipt` in the SDK, the
  `arl_get_job_receipt` MCP tool and `GET /api/v1/jobs/{token}/{jobId}/receipt`.
- arl-protocol 0.4.0 for Python: `agent_passport`, `job_audit`, `job_receipt`, `validators` and
  `trust_graph` ([packages/python-sdk](packages/python-sdk/README.md)).
- A runnable pay-on-proof example: a paid HTTP service and its caller on a local chain, in one
  command ([docs/quickstart.md](docs/quickstart.md#pay-on-proof-a-paid-http-service-in-one-command)).
- ARLscan lists the validators of the verified evaluator
  ([docs/app.md](docs/app.md#scan-arlscan)).

## 2026-11-20

- The first verified job ran on Base Mainnet: job 1 on the ARL escrow, 100 ARL, re-executed and
  approved by the three operator validators
  ([spec](apps/web/public/jobs/first-verified-job/spec.json)).
- ARLscan, a public explorer of every job and each agent's record, at arlcoin.io/app/scan
  ([docs/app.md](docs/app.md#scan-arlscan)).
- `payOnProof` in the TypeScript SDK: the provider side of the x402 `arl-escrow` scheme
  ([packages/sdk](packages/sdk/README.md)).
- The arl-reputation/1 read path: `outcomesFromChain`, `getAgentScore`, the `arl_get_agent_score`
  MCP tool and `GET /api/v1/agents/{agentId}/score`
  ([spec](spec/arl-reputation/v0.1.0/README.md)).
- The reference validator bounds the disk, memory and time a job can take and keeps its watch state
  crash-safe ([docs/reexecution-spec.md](docs/reexecution-spec.md)).
- ARL in agent frameworks through the MCP server: LangChain, CrewAI, the OpenAI Agents SDK and the
  Vercel AI SDK ([docs/frameworks.md](docs/frameworks.md)).
- arl-protocol-sdk 0.3.0 and arl-protocol-mcp 0.2.0: `payOnProof`, `getAgentScore` and the
  `arl_get_agent_score` tool ([packages/sdk](packages/sdk/README.md),
  [packages/mcp](packages/mcp/README.md)).
- An agent's verified record as an SVG badge for a README or a page:
  `GET /api/v1/agents/{agentId}/badge.svg` ([packages/mcp](packages/mcp/README.md)).
- The x402 `arl-escrow` scheme is released as v0.2.0: the terms, the `X-ARL-Job` header and what a
  service checks before it works ([spec](spec/x402-arl-escrow/v0.2.0/README.md)).
- arl-protocol 0.3.0 for Python: `agent_score` and `badge_url` read an agent's score and badge
  through the Agent API ([packages/python-sdk](packages/python-sdk/README.md)).
- The trust graph of verified work: every agent with a verified outcome, its score, and an edge
  per client and agent. `getTrustGraph` in the SDK, the `arl_get_trust_graph` MCP tool and
  `GET /api/v1/graph` ([packages/mcp](packages/mcp/README.md)).
- The audit trail of a verified job: every on-chain event in order, with who acted, when, in
  which transaction and with what hashes. `getJobAudit` in the SDK, the `arl_get_job_audit` MCP
  tool and `GET /api/v1/jobs/{token}/{jobId}/audit` (add `.csv` for a spreadsheet).
- The agent passport: an ERC-8004 agent's identity and its verified record in one answer.
  `getAgentPassport` in the SDK, the `arl_get_agent` MCP tool and `GET /api/v1/agents/{agentId}`.
- The validators' public record: who has staked, how much, and what each has done. `getValidators`
  in the SDK, the `arl_list_validators` MCP tool and `GET /api/v1/validators`.
- n8n-nodes-arl 0.2.5: works on current n8n (timers use `sleep` only) and opens verified tasks on
  the v7 evaluators.

## 2026-11-19

- `ARLVerifiedEvaluator` v6 and then v7 on Base Mainnet, with fixes from bug bounty reports; v7 is
  the live evaluator ([docs/mainnet-services.md](docs/mainnet-services.md)).
- Liquidity rewards: 60,000 ARL for the ARL/USDT pool on the Uniswap v3 staker, 21 November to
  21 December 2026.
- arl-protocol-sdk 0.2.2 and arl-protocol-mcp 0.1.2 on npm, arl-protocol 0.2.2 on PyPI.

## 2026-11-16

- `ARLJobs` v3 escrows (ARL and USDC) on Base Mainnet, and the first staking period of 300,000 ARL
  funded (ends 15 May 2027).

## 2026-11-12

- `ARLStakingRewards` and `ComputePayment` on Base Mainnet.

## 2026-10-31

- The official Telegram group is now t.me/arlprotocol_community. The community bot in
  `apps/telegram-bot` is retired; a new bot will be set up for the new group.

## 2026-10-23

- ARL token generation event on Base Mainnet.
- Portable evidence bundles for verified jobs: `arl-verifier bundle` exports a job's settlement
  evidence (`arl-evidence/1`) and `verify-bundle` checks it offline and against the chain
  ([reexecution-spec.md](docs/reexecution-spec.md#evidence-bundle)).

## 2026-10-18

- Validators run unattended: `arl-verifier watch` accepts the funded jobs whose committee names
  the validator and re-executes and votes once the provider submits; three Base Sepolia validators
  run it every 10 minutes on GitHub runners ([validators.yml](.github/workflows/validators.yml)).
  `@arl/sdk` gains `openVerifiedJob`, `getVerdict` and `finalizeJob`, and the app's Verified page
  shows the network's jobs, verdicts, validators, stake, disputes and slashing.
- Verified evaluator deployed on Base Sepolia (testnet): `ARLVerifiedEvaluator` at
  `0x6808F80Eb11538543d31cf4b50332B268dDd4d14` (source verified) with a 2-of-3 arbiter Safe at
  `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f`; a first sample job was approved by a staked
  three-validator committee. The evaluator was added after the 17 October 2026 internal security
  audit; its own tests, fuzzing, invariants, Slither and Aderyn results are in the repository.
- Signed usage receipts for x402 `upto` calls: the provider signs an EIP-712 receipt of the
  authorization charged, the units, the price, the amount and a hash of the output; the
  facilitator settles only the amount a valid receipt states, and the payer checks it with
  `checkUsageReceipt` ([payments.md](docs/payments.md#usage-receipts)). Tested through the HTTP
  facilitator and on a Base Sepolia fork.

## 2026-10-17

- Launch prepared for the TGE, 2026-10-23 00:00 UTC: the mainnet fork rehearsal passes with the
  real signers; the contract run is published for the deploy screen; the pool batches are built
  from Chainlink prices by [`launch-day-pools.sh`](scripts/launch-day-pools.sh)
  ([mainnet-runbook.md](docs/mainnet-runbook.md)).
- Pools at TGE: 5,000,000 ARL (2,000,000 Liquidity, 3,000,000 Public Launch) from 0.20 USD; the
  launchpad reserve is 1,500,000 ARL (owner decision).
- Telegram community bot live (@Arlprotocol_bot) with `/status`, `/launch` and link commands;
  uptime workflow every 10 minutes; "Live on Base Sepolia" badge in the site header.
- FAQ entry that tells ARL Protocol apart from other tokens using the ARL ticker.
- Verified evaluation of ERC-8183 jobs: `ARLVerifiedEvaluator`, a staked validator committee
  chosen by the client that acts as the job's evaluator, with a challenge window, disputes, an
  arbiter limited to disputed jobs, burn slashing and outcomes written to ERC-8004 reputation.
  Built and tested (unit, fuzz, invariant; 100% coverage)
  ([verifiable-execution.md](docs/verifiable-execution.md)).
- Verified evaluator: per-job vote and challenge windows, bond in the escrow token
  (max(budget / 10, floor)), provider approval of the committee, `accept` with a penalty for
  members that do not vote, and a Safe arbiter of at least 2-of-3 created by
  `CreateArbiterSafe` ([arbiter-safe.md](docs/arbiter-safe.md)). Tested on a Base Sepolia fork
  with a real Safe ruling and an allowlisted ERC-8004 read.
- Re-execution spec `arl-reexec/1` and the reference validator `packages/verifier`: canonical spec
  hash, inputs checked by hash and commit, a pinned container with no network, no capabilities and
  an unprivileged user, the result hash as deliverable, and on-chain accept and vote
  ([reexecution-spec.md](docs/reexecution-spec.md)).

## 2026-10-16

- Website: official channels (X @arlprotocol, Telegram t.me/arlcoin_community, team@arlcoin.io),
  structured data, web app manifest, `/.well-known/security.txt`, HSTS with subdomains, FAQ on
  testnet value, official channels and data deletion; background music removed.
- Documents state the Base Sepolia deployment everywhere; new
  [operator API security model](docs/operator-api.md) and [incident response](docs/incident-response.md).
- Repository links point to https://github.com/armanalabsai/arlcoin.io.

## 2026-10-11

- Base Sepolia ecosystem deployed and source-verified: staking, ERC-8183 jobs escrow, zero-knowledge
  verifier and anonymous-signal contract ([verification-evidence.md](docs/verification-evidence.md#explorer-verification-base-sepolia)).
- The ARL app on Base Sepolia at https://arlcoin.io/app/ with the testnet operator at
  https://app.arlcoin.io (faucet, poll joins, vote relay, x402 settlement).
- Mainnet signer addresses checked read-only on Base Mainnet ([mainnet-plan.md](docs/mainnet-plan.md)).

## 2026-10-04

- Base Sepolia deployment of 12 Safes, the ARL token, two vesting wallets and the treasury
  timelock, source-verified on Basescan, Blockscout and Sourcify.
