# Verifiable execution and evaluation layer

Status: **Phase 1 contract built and tested; not deployed.** Contract:
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
       │                           │  hash on-chain)  │    │   │  stake/unstake (ARL)       │
       │                           └────────┬─────────┘    │   │  configure (client)        │
       │                                    │ fetch        │   │  vote (committee)          │
       │                     ┌──────────────▼───────────┐  │   │  dispute (anyone, bond)    │
       │                     │ Validators (staked ARL)  │──┼──►│  finalize (anyone)         │
       │                     │  T1 re-execute           │  │   │  resolve (arbiter, P1-2)   │
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

| Boundary                     | What is trusted                                                                                                 | What is not                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Payer ↔ provider (off-chain) | Nothing: the result is referenced on-chain only by its hash                                                     | Provider claims, metering                                          |
| Validators                   | At least `threshold` of the committee the payer picked, **or** one honest party that disputes within the window | Any single validator; validators the payer did not pick            |
| Arbiter (Phases 1–2)         | Rules correctly on disputed jobs only                                                                           | Never holds escrow or slashed funds; cannot act on undisputed jobs |
| ARLJobs / evaluator          | Code only: no owner, no upgrade, parameters immutable                                                           | —                                                                  |
| ERC-8004 registries          | Correct storage of feedback                                                                                     | Liveness: a failing registry never blocks settlement               |
| Base                         | Inclusion of a dispute within the challenge window (sequencer, or L1 forced inclusion)                          | —                                                                  |

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
enum Phase { None, Configured, Approved, Rejected, Disputed, Finalized, Released }

struct Config {
    Tier tier;
    uint8 threshold;
    uint96 bond;             // locked per vote, in the stake token (ARL)
    uint256 providerAgentId; // ERC-8004 agent that receives the outcome; 0 = none
    bytes32 specHash;        // keccak256 of the job spec: program/model digest, inputs, method
    address[] committee;     // chosen by the client, ≤ 7, distinct, never the client
}

constructor(ARLJobs jobs, IERC20 stakeToken, address arbiter, uint64 challengeWindow,
            uint96 minBond, IERC8004Identity identity, IERC8004Reputation reputation);

function stake(uint256 amount) external;
function unstake(uint256 amount) external;                     // only unlocked stake
function configure(uint256 jobId, Config calldata cfg) external; // job client, job Open
function vote(uint256 jobId, bool approve, bytes32 deliverable, bytes32 evidence) external;
function dispute(uint256 jobId, bytes32 evidence) external;    // escrows `bond` from the caller
function finalize(uint256 jobId) external;                     // anyone, after the window
function resolve(uint256 jobId, bool approve, bytes32 reason) external; // arbiter, disputed only
function release(uint256 jobId) external;                      // anyone, after ARLJobs expiry/cancel
```

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
 Open ──configure (client)─────► Configured
  │  (evaluator == this)            │
 fund                               │ vote ×k (committee; job Submitted; locks bond)
  ▼                                 │
 Funded ──submit (provider)──►      ├── approvals == t ──────────► Approved  ┐ challengeEnds =
 Submitted                          └── rejections > k − t ──────► Rejected  ┘ now + window
                                                                     │   │
                     no dispute, now ≥ challengeEnds ── finalize ────┤   └── dispute (bond) ─► Disputed
                                                                     ▼                          │
 Completed ◄── complete ── (approved) ─────────────────────────── Finalized ◄── resolve ────────┘
 Rejected  ◄── reject ──── (rejected)                                (arbiter: overturn → burn the
                                                                      losing voters' bonds, return the
                                                                      challenger's; uphold → burn the
                                                                      challenger's bond)
 Expired (claimRefund, anyone, after expiredAt) ──► release ──► Released (all bonds unlocked, nothing slashed)
 Rejected by client while Open                  ──► release ──► Released
```

Rules the contract enforces:

- `configure` only by the job's client, only while the job is Open, only if the job names this
  contract as evaluator, once per job, with `expiredAt ≥ now + 2 × challengeWindow`.
- `vote` once per committee member, only while the job is Submitted and undecided; the provider
  cannot vote; every approval names the same deliverable; the bond is locked from free stake.
- The decision is irreversible except by `resolve`; late votes are refused.
- `finalize` and `resolve` are the only paths that call `ARLJobs.complete/reject`.

## Security invariants

| #   | Invariant                                                                                                             | Where it is checked                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| I1  | The escrow goes to exactly one side (provider or client), never split, never elsewhere                                | `testFuzz_escrowToExactlyOneSide`, `invariant_escrowConserved`             |
| I2  | The evaluator holds exactly the validators' stake plus open challenger bonds                                          | `invariant_evaluatorSolvent`                                               |
| I3  | Locked stake never exceeds stake, and equals the bonds of votes on live jobs                                          | `invariant_lockedWithinStake`, `invariant_locksMatchLiveVotes`             |
| I4  | No state locks funds: after the job deadline the client is refunded by anyone and every bond is released              | `test_releaseAfterExpiryWhileDisputed`, `test_releaseUndecidedAfterExpiry` |
| I5  | The arbiter can neither receive the escrow nor slashed funds (burned to `0x…dEaD`), and cannot act on undisputed jobs | `test_RevertWhen_ResolveNotArbiterOrNotDisputed`, resolve tests            |
| I6  | Only the payer-chosen committee votes, once each; the client cannot sit on it; the provider cannot vote               | configure and vote revert tests                                            |
| I7  | A failing, reverting or gas-burning ERC-8004 registry never blocks settlement                                         | `test_feedbackFailureNeverBlocksSettlement`                                |
| I8  | No owner, no upgrade, no mutable parameter                                                                            | contract has no privileged setter (review)                                 |

Minimum trust assumptions (Phase 1): at least `threshold` honest validators among those the payer
picked **or** one honest disputer inside the window; an honest arbiter for disputed jobs only;
Base including a dispute transaction within the window.

## Threat model (top 5)

| Attack                            | Scenario                                                                           | Mitigation (built = ✔, planned = P2/P3)                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Replay                            | A vote, approval or payment authorization reused on another job, chain or contract | ✔ Votes are transactions bound to `(evaluator, jobId)` storage, one per member; no off-chain signature is accepted. ✔ x402 authorizations are single-use (Permit2/EIP-3009 nonces, chain id in the domain; `AuthorizationStore`). P2: the payment nonce/witness is `keccak256(terms)`, so a signature funds exactly one set of terms |
| Collusion (provider + validators) | Provider pays or controls the committee to approve bad work                        | ✔ The payer picks the committee, not the provider. ✔ Strict majority ≥ 2 for checked tiers. ✔ Every approver locks a bond and is burned if a dispute overturns the decision. ✔ Anyone can dispute during the window. P3: proof-backed resolution makes overturning objective                                                         |
| Evaluator bribery                 | Bribe ≥ value at risk for the committee                                            | ✔ Cost of corrupting a job ≥ `threshold × bond` plus losing future jobs (ERC-8004 record is portable and public). Clients size `bond` against `budget`; the SDK refuses `threshold × bond < budget` for checked tiers (P2 policy)                                                                                                    |
| TEE compromise                    | A forged or stale quote from a broken enclave approves wrong output                | P2: validators accept only quotes whose measurement and TCB level are on a pinned allowlist and whose report data binds `specHash` and the deliverable; P3: on-chain quote verification. ✔ An `Attested` approval is still a staked majority vote and still disputable, so a broken TEE alone is not enough                          |
| DoS / griefing                    | Validators never vote; arbiter never rules; spam disputes; a broken registry       | ✔ The job deadline is the backstop: `claimRefund` + `release`, nothing is locked forever. ✔ A dispute costs a bond equal to the validator bond and is burned if it fails. ✔ Registry calls are gas-capped, return data bounded, failures only emit `FeedbackFailed`. ✔ Committee ≤ 7 bounds every loop                               |

Known residual risks: the Phase 1 arbiter can rule wrongly on a disputed job (bounded: escrow only
to client or provider, nothing to the arbiter); a validator that refuses to vote is not penalized
(no liveness slashing yet); validators are not paid by the contract yet.

## MVP phases

| Phase | Time      | Deliverables                                                                                                                                                                                                                                                                                                                                    | State     |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1     | 1–2 weeks | `ARLVerifiedEvaluator` with stake, committee votes, challenge window, dispute, arbiter ruling, burn slashing, release, ERC-8004 feedback; unit, fuzz and invariant tests; 100% line/function/branch coverage; Slither clean; this document                                                                                                      | **Built** |
| 1     |           | Base Sepolia deployment script against the deployed `ARLJobs` and the canonical ERC-8004 registries, rehearsed on a fork                                                                                                                                                                                                                        | **Built** |
| 1     |           | Deployment (needs the open questions 1–2 answered and the operator key); the operator stakes as the first `Fallback` validator; reference validator in `packages/provider` that re-executes a container job and votes                                                                                                                           | Next      |
| 2     | 2–4 weeks | `ARLX402JobGateway` (EIP-3009 USDC, Permit2 ARL); a USDC `ARLJobs` instance; x402 `extra.escrowTerms` in `@arl/payments`; validator fee paid at `configure` and split among voters on the winning side; SDK tier policy (`threshold × bond ≥ budget`); TEE quote checking in the reference validator; dapp screens for configure, vote, dispute | Design    |
| 3     | 4–8 weeks | `IExecutionVerifier` adapters (Noir/UltraHonk, a zkVM verifier, TEE quote verifier); `approveWithProof`, `resolveWithProof`; challenger reward from slashed bonds once disputes are proof-resolved; arbiter retired for provable specs                                                                                                          | Design    |

## Why this design

| Alternative                                                       | Why not on its own                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimistic verification only (anyone can challenge, no committee) | Needs an always-on, funded watcher for every job; at low volume nobody watches, so wrong results pass by default. Here the committee gives a positive check, and the optimistic window is kept as the second line                            |
| Pure ZK (ZKML for every job)                                      | Proving cost and latency are orders of magnitude above the job itself for current LLM sizes, and most AI workloads have no circuit. Used where it is cheap and decisive: high-value jobs and dispute resolution (Phase 3)                    |
| Centralized oracle                                                | One key decides every payment: the trust problem moves, it is not solved, and the oracle is a single bribery and outage target. Here the only privileged role is a dispute-only arbiter that cannot take funds, and it is removed in Phase 3 |
| A new chain or payment rail                                       | ERC-8183, x402 and ERC-8004 already define escrow, payment and identity, are deployed on Base and are used by this project; the layer is one evaluator contract plus a gateway                                                               |

## Open questions (answer before Phase 1 deployment)

1. **Arbiter account.** The founder EOA, a Safe, or `ARLTimelock`? The timelock's 48-hour delay
   requires `expiredAt ≥ now + 2 × window + 48 h` for a ruling to land before the deadline.
2. **Parameters.** `challengeWindow` (proposed: 1 hour on Base Sepolia; ≥ 24 hours on Base Mainnet,
   above Base's forced-inclusion delay) and `minBond` in ARL (no ARL price exists yet).
3. **USDC jobs.** Deploy a second `ARLJobs` with USDC as the payment token, or keep jobs in ARL and
   use USDC only through x402 `upto`? (`docs/payments.md` currently settles ARL only.)
4. **Validator payment.** Fee in the job's payment token or in ARL; paid to all voters or only to
   those who voted with the final outcome?
5. **Which workloads are first.** Re-execution needs a deterministic spec format (container digest,
   input hashes, seed, decoding settings). Which job types does the first provider run?
6. **TEE vendor.** Intel TDX, AMD SEV-SNP or NVIDIA confidential GPUs determine the quote format and
   the on-chain verifier for Phase 3.
7. **Reuse of an existing escrow for x402.** An audited auth-and-capture escrow for x402 exists in
   the Base ecosystem; evaluate it against the gateway above before writing Phase 2.
