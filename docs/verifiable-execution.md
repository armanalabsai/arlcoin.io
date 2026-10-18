# Verifiable execution and evaluation layer

Status: **Phase 1 contract built, tested and deployed on Base Sepolia** (testnet only:
[`0x6808F80Eb11538543d31cf4b50332B268dDd4d14`](https://base-sepolia.blockscout.com/address/0x6808F80Eb11538543d31cf4b50332B268dDd4d14),
source verified; evidence in [verification-evidence.md](verification-evidence.md)). Not audited.
Contract:
[`ARLVerifiedEvaluator.sol`](../contracts/src/ARLVerifiedEvaluator.sol). Deployment script:
[`DeploySepoliaEvaluator.s.sol`](../contracts/script/DeploySepoliaEvaluator.s.sol). Phases 2 and 3
are designs only.

| Suite      | Command                                                                                                  | Covers                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit, fuzz | `forge test --match-contract ARLVerifiedEvaluatorTest`                                                   | Every transition and who may make it; refused inputs; slashing on overturn and on a failed dispute; release after expiry; failing, malformed and gas-burning registries; escrow to one side (fuzz)          |
| Invariant  | `forge test --match-contract ARLVerifiedEvaluatorInvariant`                                              | Solvency (balance = stake + open challenger bonds), locked within stake, locks = votes of live jobs, escrow conserved                                                                                       |
| Deployment | `forge test --match-contract DeploySepoliaEvaluatorTest`                                                 | Base Sepolia and local only; inputs must have code; canonical ERC-8004 registries on Base Sepolia                                                                                                           |
| Fork       | `FOUNDRY_PROFILE=fork ARL_FORK_RPC=<Base Sepolia RPC> forge test --match-contract VerifiedEvaluatorFork` | Against the deployed ARL, `ARLJobs` and ERC-8004 registries: an approved job pays the provider and the real ReputationRegistry records the evaluator's feedback; an overturned approval refunds and slashes |

## Problem

A client pays a provider for AI or compute work. ERC-8183 escrows the payment, but the release
depends on one `evaluator` account. If that account is the client, the provider can be refused
after delivering; if it is anyone else, the client must trust it. x402 payments go straight from
payer to payee, so nothing ties the money to the work being right.

This layer answers two questions without a new chain or payment rail:

1. How does the payer know the work was done correctly? Validators the payer chose check it with a
   method matched to the risk, and lock stake on their vote.
2. How is the payment released only on verified completion? The evaluator of the ERC-8183 job is a
   contract that pays the provider only after a quorum approval has survived a challenge window.

## Architecture

```
                   OFF-CHAIN                               │              BASE (on-chain)
                                                           │
 ┌────────────┐  HTTP 402 + terms   ┌──────────────────┐   │   ┌────────────────────────────┐
 │   Payer    │◄────────────────────│  Provider (x402  │   │   │ ARLJobs (ERC-8183 escrow)  │
 │  (client)  │──── signed payment ►│ resource server) │   │   │  deployed, unchanged       │
 └─────┬──────┘                     └────────┬─────────┘   │   │  Open→Funded→Submitted→    │
       │ P1: createJob/fund/configure        │ submit(hash)│   │  Completed|Rejected|Expired│
       │ P2: one x402 signature ─────────────┼─────────────┼──►└──────▲──────────▲──────────┘
       │      via ARLX402JobGateway          │             │          │ complete │ claimRefund
       │                                     ▼             │          │ /reject  │ (anyone,
       │                           ┌──────────────────┐    │   ┌──────┴──────────┴──────────┐
       │                           │ Result store     │    │   │ ARLVerifiedEvaluator       │
       │                           │ (IPFS/HTTPS;     │    │   │  = the job's evaluator     │
       │                           │  hash on-chain)  │    │   │  stake/unstake (escrow tok)│
       │                           └────────┬─────────┘    │   │  configure (client)        │
       │                                    │              │   │  approveCommittee (prov.)  │
       │                                    │              │   │  accept (locks bond)       │
       │                                    │ fetch        │   │  vote / closeUndecided     │
       │                     ┌──────────────▼───────────┐  │   │  dispute (anyone, bond)    │
       │                     │ Validators (staked)      │──┼──►│  finalize (anyone)         │
       │                     │  T1 re-execute           │  │   │  resolve (arbiter Safe)    │
       │                     │  T2 check TEE quote      │  │   │  release (anyone)          │
       │                     │  T3 check ZK proof       │  │   └──────┬──────────────┬──────┘
       │                     └──────────────────────────┘  │          │ giveFeedback │ P3:
       │                                                   │   ┌──────▼──────────┐ ┌─▼──────────────┐
       └──── dispute(evidence) ────────────────────────────┼──►│ ERC-8004        │ │ Proof verifiers│
                                                           │   │ Identity +      │ │ (Noir/UltraHonk│
                                                           │   │ Reputation      │ │  zkVM, TEE     │
                                                           │   │ (canonical)     │ │  attestation)  │
                                                           │   └─────────────────┘ └────────────────┘
```

Trust boundaries:

| Boundary                     | What is trusted                                                                                                                              | What is not                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Payer ↔ provider (off-chain) | Nothing: the result is referenced on-chain only by its hash                                                                                  | Provider claims, metering                                          |
| Validators                   | At least `threshold` of the committee the client proposed and the provider approved, **or** one honest party that disputes within the window | Any single validator; validators not on the committee              |
| Arbiter Safe (Phases 1–2)    | A majority of its ≥ 3 signers rules correctly on disputed jobs only ([arbiter-safe.md](arbiter-safe.md))                                     | Never holds escrow or slashed funds; cannot act on undisputed jobs |
| ARLJobs / evaluator          | Code only: no owner, no upgrade, parameters immutable or per job within fixed bounds                                                         | —                                                                  |
| ERC-8004 registries          | Correct storage of feedback                                                                                                                  | Liveness: a failing registry never blocks settlement               |
| Base                         | Inclusion of a dispute within the challenge window (sequencer, or L1 forced inclusion)                                                       | —                                                                  |

## Risk tiers

The client picks the tier per job; the contract enforces the committee shape. The SDK proposes a
default from the budget and the workload.

| Tier          | Method (what validators do)                                                                                           | Committee (enforced)                   | Use                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Fallback`    | One staked validator re-executes or reviews                                                                           | exactly 1-of-1                         | Low value, or too few validators online                                                      |
| `Reexecution` | Re-run the job from `specHash` (container digest, inputs hash, seed) and compare the output hash with the deliverable | strict majority, ≥ 2 (2-of-3, 3-of-5…) | Deterministic work: code, data transforms, CPU inference with fixed seed and greedy decoding |
| `Attested`    | Check a TEE quote (or a proof) that binds the enclave measurement to `specHash` and the deliverable                   | strict majority, ≥ 2                   | Non-deterministic or private work (GPU inference, private data)                              |
| Proof (P3)    | The contract checks the proof itself                                                                                  | none needed for the decision           | High value; also resolves disputes of the tiers above objectively                            |

Re-execution only proves anything for deterministic workloads. GPU LLM inference is generally not
bit-reproducible, so such jobs belong in `Attested`, not `Reexecution`.

## Contract interfaces

### Phase 1 (built): `ARLVerifiedEvaluator`

```solidity
enum Tier { Fallback, Reexecution, Attested }
enum Phase { None, Configured, Approved, Rejected, Disputed, Finalized, Released, Failed }

struct Config {
    Tier tier;
    uint8 threshold;
    uint64 voteWindow;       // per job, 10 minutes to 7 days
    uint64 challengeWindow;  // per job, minChallengeWindow to 30 days
    uint96 bond;             // floor, ≥ minBond; the bond is max(floor, budget / 10)
    uint256 providerAgentId; // ERC-8004 agent that receives the outcome; 0 = none
    bytes32 specHash;        // keccak256 of the canonical job spec (reexecution-spec.md)
    address[] committee;     // proposed by the client, ≤ 7, distinct, never the client
}

constructor(ARLJobs jobs, address arbiter, uint64 minChallengeWindow, uint96 minBond,
            IERC8004Identity identity, IERC8004Reputation reputation);
// stakeToken = jobs.paymentToken(): stakes and bonds are in the escrow's own token.

function stake(uint256 amount) external;
function unstake(uint256 amount) external;                       // only unlocked stake
function configure(uint256 jobId, Config calldata cfg) external; // job client, job Open
function approveCommittee(uint256 jobId) external;               // job provider
function accept(uint256 jobId) external;                         // member, job funded; locks bond
function startVoting(uint256 jobId) external;                    // anyone, job Submitted
function vote(uint256 jobId, bool approve, bytes32 deliverable, bytes32 evidence) external;
function closeUndecided(uint256 jobId) external;                 // anyone, after the vote window
function dispute(uint256 jobId, bytes32 evidence) external;      // escrows the bond
function finalize(uint256 jobId) external;                       // anyone, after the challenge window
function resolve(uint256 jobId, bool approve, bytes32 reason) external; // arbiter Safe, disputed only
function release(uint256 jobId) external;                        // anyone, after expiry or cancel
```

Arbiter: a Safe v1.5.0 with at least 3 signers and a majority threshold ≥ 2, created by
[`CreateArbiterSafe.s.sol`](../contracts/script/CreateArbiterSafe.s.sol) and required by the
deployment script on Base Sepolia ([arbiter-safe.md](arbiter-safe.md)).

### Phase 2 (design): `ARLX402JobGateway`

Lets an x402 payer open, fund and configure a verified job with the one signature x402 already
asks for. The gateway is the ERC-8183 `client` and records the real payer.

```solidity
struct JobTerms {
    address provider;
    uint256 budget;
    uint256 expiredAt;
    bytes32 descriptionHash;
    ARLVerifiedEvaluator.Config evaluation;
    bytes32 salt;
}

/// USDC (EIP-3009): nonce == keccak256(abi.encode(terms)), so the terms are bound to the signature.
function openWithAuthorization(
    JobTerms calldata terms, address payer, uint256 validAfter, uint256 validBefore,
    bytes calldata signature
) external returns (uint256 jobId);

/// ARL (Permit2 witness transfer): the witness is keccak256(abi.encode(terms)).
function openWithPermit2(
    JobTerms calldata terms, ISignatureTransfer.PermitTransferFrom calldata permit,
    address payer, bytes calldata signature
) external returns (uint256 jobId);

/// Pays a refunded budget (Rejected or Expired job) to its payer, once.
function withdrawRefund(uint256 jobId) external;
```

The payer side of x402 is unchanged: request → `402 Payment Required` (now with
`extra.escrowTerms` and `payTo` = the gateway) → sign → retry. The resource server answers once the
job is Submitted and returns the result reference; the payment is released by the evaluator, not
by the facilitator. USDC jobs use a second `ARLJobs` deployment whose payment token is USDC (the
contract takes any ERC-20 at deployment); the evaluator stake stays in ARL.

### Phase 3 (design): proof-backed decisions and disputes

```solidity
interface IExecutionVerifier {
    /// True if `proof` shows that the program/model committed in `specHash`, run on the committed
    /// inputs, produced `deliverable`.
    function verify(bytes32 specHash, bytes32 deliverable, bytes calldata proof)
        external view returns (bool);
}

function approveWithProof(uint256 jobId, bytes32 deliverable, bytes calldata proof) external;
function resolveWithProof(uint256 jobId, bytes32 deliverable, bytes calldata proof) external;
```

Adapters reuse deployed, open-source verifiers instead of new cryptography: the Noir/UltraHonk
toolchain this repository already pins (`zk/`), zkVM verifier contracts for deterministic programs,
and an on-chain TEE quote verifier for `Attested`. `resolveWithProof` replaces the arbiter for any
job whose spec can be proven; once it exists, slashed bonds can pay the challenger without letting
an arbiter profit.

## State machine

```
 ARLJobs                         ARLVerifiedEvaluator
 ───────                         ────────────────────
 Open ──configure (client)─────► Configured ── approveCommittee (provider)
  │  (evaluator == this)            │
 fund                               │ accept ×k (member; job Funded; locks max(floor, budget/10))
  ▼                                 │
 Funded ──submit (provider)──►      │ startVoting / first vote: voteEnds = now + voteWindow
 Submitted                          │ vote (accepted member, before voteEnds)
                                    ├── approvals == t ──────────► Approved  ┐ challengeEnds =
                                    ├── rejections > k − t ──────► Rejected  ┘ now + challengeWindow
                                    └── now ≥ voteEnds, undecided ─ closeUndecided ─► Failed
                                          (bonds of accepted non-voters burned; client refunded)
                                                                     │   │
                     no dispute, now ≥ challengeEnds ── finalize ────┤   └── dispute (bond) ─► Disputed
                                                                     ▼                          │
 Completed ◄── complete ── (approved) ─────────────────────────── Finalized ◄── resolve ────────┘
 Rejected  ◄── reject ──── (rejected)                                (arbiter Safe: overturn → burn
                                                                      the losing voters' bonds, return
                                                                      the challenger's; uphold → burn
                                                                      the challenger's bond)
 Expired (claimRefund, anyone, after expiredAt) ──► release ──► Released (all bonds unlocked, nothing slashed)
 Rejected by client while Open                  ──► release ──► Released
```

Rules the contract enforces:

- `configure` only by the job's client, only while the job is Open, only if the job names this
  contract as evaluator, once per job, windows within bounds, and
  `expiredAt ≥ now + voteWindow + 2 × challengeWindow`.
- `approveCommittee` only by the job's provider, once; a provider on its own committee is refused.
  No member can accept before it.
- `accept` once per member, after approval, while the job is Funded or Submitted and before voting
  starts; the bond is fixed by the first acceptance.
- `vote` once per accepted member, while the job is Submitted, before `voteEnds` and before a
  decision; every approval names the same deliverable.
- After `voteEnds` without a decision, `closeUndecided` burns the bonds of members that accepted
  and did not vote, and refunds the client. Members that never accepted lock and lose nothing.
- The decision is irreversible except by `resolve`; late votes are refused.
- `finalize`, `resolve` and `closeUndecided` are the only paths that call `ARLJobs.complete/reject`.

## Parameters

| Parameter                 | Base Sepolia            | Base Mainnet                                                                    |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `minChallengeWindow`      | 1 hour                  | 24 hours (above Base's forced-inclusion delay)                                  |
| Per-job `challengeWindow` | ≥ 1 hour                | 24 hours by default; 48–72 hours for high-value jobs (set by job type, see SDK) |
| Per-job `voteWindow`      | 1 hour                  | 6–24 hours by job type                                                          |
| `minBond` (escrow token)  | 1 ARL                   | Set at deployment per escrow token; for USDC jobs a $10–100 floor               |
| Bond per job              | max(floor, budget / 10) | max(floor, budget / 10)                                                         |

The bond floor is a technical gate against zero-cost votes, not an economic guarantee: until the
escrow token has a market price, the economic part of the bond is the tenth of the budget.

## Security invariants

| #   | Invariant                                                                                                                  | Where it is checked                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| I1  | The escrow goes to exactly one side (provider or client), never split, never elsewhere                                     | `testFuzz_escrowToExactlyOneSide`, `invariant_escrowConserved`                       |
| I2  | The evaluator holds exactly the validators' stake plus open challenger bonds                                               | `invariant_evaluatorSolvent`                                                         |
| I3  | Locked stake never exceeds stake, and equals the bonds of members that accepted live jobs                                  | `invariant_lockedWithinStake`, `invariant_locksMatchLiveVotes`                       |
| I4  | No state locks funds: after the job deadline the client is refunded by anyone and every bond is released                   | `test_releaseAfterExpiryWhileDisputed`, `test_releaseUndecidedAfterExpiry`           |
| I5  | The arbiter can neither receive the escrow nor slashed funds (burned to `0x…dEaD`), and cannot act on undisputed jobs      | `test_RevertWhen_ResolveNotArbiterOrNotDisputed`, resolve tests                      |
| I6  | Only accepted members of a committee the provider approved vote, once each; neither the client nor the provider sits on it | configure, approve, accept and vote revert tests                                     |
| I9  | A member that accepted and did not vote within the vote window loses its bond; one that never accepted loses nothing       | `test_closeUndecidedBurnsAbsenteesAndRefunds`, `test_closeUndecidedWithoutAbsentees` |
| I10 | Stakes and bonds are in the escrow's own token                                                                             | `test_stakeTokenIsTheEscrowToken`                                                    |
| I7  | A failing, reverting or gas-burning ERC-8004 registry never blocks settlement                                              | `test_feedbackFailureNeverBlocksSettlement`                                          |
| I8  | No owner, no upgrade, no mutable parameter                                                                                 | contract has no privileged setter (review)                                           |

Minimum trust assumptions (Phase 1): at least `threshold` honest validators among those the client
proposed and the provider approved **or** one honest disputer inside the window; an honest majority of the arbiter Safe's signers for disputed jobs only;
Base including a dispute transaction within the window.

## Threat model (top 5)

| Attack                            | Scenario                                                                                | Mitigation (built = ✔, planned = P2/P3)                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay                            | A vote, approval or payment authorization reused on another job, chain or contract      | ✔ Votes are transactions bound to `(evaluator, jobId)` storage, one per member; no off-chain signature is accepted. ✔ x402 authorizations are single-use (Permit2/EIP-3009 nonces, chain id in the domain; `AuthorizationStore`). P2: the payment nonce/witness is `keccak256(terms)`, so a signature funds exactly one set of terms                                                                                                     |
| Collusion (provider + validators) | Provider pays or controls the committee to approve bad work                             | ✔ The client proposes the committee and the provider must approve it, so neither side fills it alone. ✔ Strict majority ≥ 2 for checked tiers. ✔ Every approver locks a bond and is burned if a dispute overturns the decision. ✔ Anyone can dispute during the window. P3: proof-backed resolution makes overturning objective                                                                                                          |
| Evaluator bribery                 | Bribe ≥ value at risk for the committee                                                 | ✔ Cost of corrupting a job ≥ `threshold × bond` plus losing future jobs (ERC-8004 record is portable and public). Clients size `bond` against `budget`; the SDK refuses `threshold × bond < budget` for checked tiers (P2 policy)                                                                                                                                                                                                        |
| TEE compromise                    | A forged or stale quote from a broken enclave approves wrong output                     | P2: validators accept only quotes whose measurement and TCB level are on a pinned allowlist and whose report data binds `specHash` and the deliverable; P3: on-chain quote verification. ✔ An `Attested` approval is still a staked majority vote and still disputable, so a broken TEE alone is not enough                                                                                                                              |
| DoS / griefing                    | Validators accept and never vote; arbiter never rules; spam disputes; a broken registry | ✔ Accepted members that do not vote within the vote window lose their bond and the client is refunded at once (`closeUndecided`). ✔ The job deadline is the backstop: `claimRefund` + `release`, nothing is locked forever. ✔ A dispute costs a bond equal to the validator bond and is burned if it fails. ✔ Registry calls are gas-capped, return data bounded, failures only emit `FeedbackFailed`. ✔ Committee ≤ 7 bounds every loop |

## Known limitations (Phase 1)

| Limitation                      | Consequence                                                                                                                    | Planned fix                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| No Sybil resistance             | Anyone can stake and be proposed; one operator can run many validators. Only the provider's approval and the bonds limit it    | Validator selection weighted by stake and ERC-8004 history (P2) |
| Committee chosen by the parties | Client and provider together pick the committee; colluding parties can pick their own validators against nobody but themselves | VRF selection from the staked set (P2, below)                   |
| Central arbiter                 | The arbiter Safe's signers rule on disputes; a wrong ruling moves one job's escrow between client and provider                 | Proof-resolved disputes (P3); timelock arbiter (P2)             |
| No validator fees               | Validators are not paid by the contract; until then the operator runs them                                                     | Fee at `configure`, paid to voters on the final side (P2)       |
| LLM jobs not supported          | GPU LLM inference is not bit-reproducible, so `Reexecution` cannot check it                                                    | `Attested` with TEE quotes (P2), proofs (P3)                    |
| Bond floor has no market value  | Until the escrow token has a price, the floor only gates zero-cost votes                                                       | USDC jobs with a $10–100 floor (P2)                             |
| Absence penalty needs a start   | The vote window starts at the first vote or `startVoting`; if nobody starts it, the job waits for its deadline refund          | The gateway starts it on submission (P2)                        |

## Committee selection by VRF (Phase 2 plan)

1. Validators register in a stake-weighted set with an ERC-8004 agent id; entry and exit take
   effect after a delay, so the set is fixed before a job's seed exists.
2. `configure` names only the tier, `k` and `t`; at funding, the evaluator requests randomness from
   a VRF deployed on Base and stores the request id.
3. The VRF callback draws `k` distinct members, weighted by stake, excluding the client, the provider
   and accounts linked to either (same ERC-8004 owner).
4. A member that does not accept within a short window is replaced by the next draw and loses a
   small part of its stake.
5. Until then (Phase 1), the client proposes and the provider approves, and a committee is at most
   7 members.

## MVP phases

| Phase | Time      | Deliverables                                                                                                                                                                                                                                                                                                                                    | State                                                         |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1     | 1–2 weeks | `ARLVerifiedEvaluator` with stake, committee votes, challenge window, dispute, arbiter ruling, burn slashing, release, ERC-8004 feedback; unit, fuzz and invariant tests; 100% line/function/branch coverage; Slither clean; this document                                                                                                      | **Built**                                                     |
| 1     |           | Base Sepolia deployment script against the deployed `ARLJobs` and the canonical ERC-8004 registries, rehearsed on a fork                                                                                                                                                                                                                        | **Built**                                                     |
| 1     |           | Per-job windows, bond = max(floor, budget / 10) in the escrow token, provider approval of the committee, `accept` and the absence penalty; arbiter Safe script and check; fork tests with a real Safe ruling and an allowlisted ERC-8004 read                                                                                                   | **Built**                                                     |
| 1     |           | Re-execution spec (`arl-reexec/1`) and reference verifier in `packages/verifier`, tested in a real container and on a local chain ([reexecution-spec.md](reexecution-spec.md))                                                                                                                                                                  | **Built**                                                     |
| 1     |           | Base Sepolia deployment ([evaluator-sepolia-runbook.md](evaluator-sepolia-runbook.md); needs the arbiter Safe and the operator key); the operator stakes as the first validators                                                                                                                                                                | **Done** (2026-10-18; test accounts staked, not the operator) |
| 2     | 2–4 weeks | `ARLX402JobGateway` (EIP-3009 USDC, Permit2 ARL); a USDC `ARLJobs` instance; x402 `extra.escrowTerms` in `@arl/payments`; validator fee paid at `configure` and split among voters on the winning side; SDK tier policy (`threshold × bond ≥ budget`); TEE quote checking in the reference validator; dapp screens for configure, vote, dispute | Design                                                        |
| 3     | 4–8 weeks | `IExecutionVerifier` adapters (Noir/UltraHonk, a zkVM verifier, TEE quote verifier); `approveWithProof`, `resolveWithProof`; challenger reward from slashed bonds once disputes are proof-resolved; arbiter retired for provable specs                                                                                                          | Design                                                        |

## Why this design

| Alternative                                                       | Why not on its own                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimistic verification only (anyone can challenge, no committee) | Needs an always-on, funded watcher for every job; at low volume nobody watches, so wrong results pass by default. Here the committee gives a positive check, and the optimistic window is kept as the second line                            |
| Pure ZK (ZKML for every job)                                      | Proving cost and latency are orders of magnitude above the job itself for current LLM sizes, and most AI workloads have no circuit. Used where it is cheap and decisive: high-value jobs and dispute resolution (Phase 3)                    |
| Centralized oracle                                                | One key decides every payment: the trust problem moves, it is not solved, and the oracle is a single bribery and outage target. Here the only privileged role is a dispute-only arbiter that cannot take funds, and it is removed in Phase 3 |
| A new chain or payment rail                                       | ERC-8183, x402 and ERC-8004 already define escrow, payment and identity, are deployed on Base and are used by this project; the layer is one evaluator contract plus a gateway                                                               |

## Decisions (2026-10-17)

1. **Arbiter**: a Safe of separate hardware wallets (2-of-3 or 3-of-5), not an EOA and not yet the
   timelock ([arbiter-safe.md](arbiter-safe.md)). Moving to `ARLTimelock` in Phase 2, with longer
   job deadlines.
2. **Parameters**: challenge window 1 hour on Base Sepolia, at least 24 hours on Base Mainnet, per
   job within bounds (48–72 hours for high-value jobs). Bond in the escrow token,
   max(budget / 10, floor).
3. **First workload**: deterministic code execution and test runs (`Reexecution`), not LLM output.
4. **ERC-8004 reads are allowlisted**: anyone can write feedback to the ReputationRegistry, so a
   verified score counts only feedback from the deployed evaluator: `getSummary(agentId,
[evaluator], "arl-verified", "")` (tested on the fork: a third party's fake feedback is not
   counted).

## Open questions

1. **USDC jobs.** A second `ARLJobs` with USDC as payment token (Phase 2), or USDC only through x402?
2. **Validator payment.** Fee in the escrow token, paid only to voters on the final side?
3. **TEE vendor.** Intel TDX, AMD SEV-SNP or NVIDIA confidential GPUs (quote format, Phase 3
   verifier).
4. **Reuse of an existing escrow for x402.** An audited auth-and-capture escrow for x402 exists in
   the Base ecosystem; evaluate it against the gateway above before writing Phase 2.
