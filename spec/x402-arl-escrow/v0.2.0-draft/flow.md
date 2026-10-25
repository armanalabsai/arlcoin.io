# x402-arl-escrow v0.2.0 (draft): end-to-end flow

Status: **draft for review**, 2026-10-24. Non-normative until v0.2.0 is released. It maps the
verified-payment flow onto the contracts as deployed today, so every step names the function,
the caller, the precondition that reverts, and the event a third party reads.

Decisions this draft follows (owner, 2026-10-24):

- Jobs are paid in **ARL**. Validators stake and bond in ARL as well, because
  `ARLVerifiedEvaluator.stakeToken` is the escrow's payment token. Slashed ARL goes to
  `0x000000000000000000000000000000000000dEaD`.
- The escrow is `ARLJobs` (ERC-8183); the evaluator is `ARLVerifiedEvaluator`. Neither has an
  owner.

## 1. Actors

| Actor     | On chain                                             | Off chain                                    |
| --------- | ---------------------------------------------------- | -------------------------------------------- |
| Client    | `ARLJobs` client of the job (the paying agent)       | `@arl/sdk` (`openVerifiedJob`, `getVerdict`) |
| Provider  | `ARLJobs` provider; submits the deliverable          | runs the job from the pinned spec            |
| Validator | staked in `ARLVerifiedEvaluator`, committee member   | `arl-verifier watch` (`step`)                |
| Arbiter   | the Safe in `ARLVerifiedEvaluator.arbiter`           | rules on disputes, 2 of 3                    |
| Anyone    | may call `startVoting`, `finalize`, `closeUndecided` | watchers, the client's SDK                   |

## 2. The flow

### Step 0: discovery (HTTP)

The service answers `402 Payment Required` with `scheme: "arl-escrow"` and, in `extra`:
`jobs` (ARLJobs address), `evaluator`, `provider` (the service's address), `specUri`, `specHash`,
`budget` (ARL base units), `expiredAt`, `committee`, `threshold`, `voteWindow`,
`challengeWindow`, `bond`. The client checks `specHash` against the spec it downloads
(`@arl/verifier`, `specHash`).

### Step 1: open and fund (client)

| #   | Call                                                                                                                                      | Caller             | Reverts when                                                                                      | Event               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ------------------- |
| 1a  | `ARLJobs.createJob(provider, evaluator, expiredAt, description, address(0))`                                                              | client             | `expiredAt` too soon, a hook is set, description too long                                         | `JobCreated`        |
| 1b  | `ARLVerifiedEvaluator.configure(jobId, Config{tier, threshold, voteWindow, challengeWindow, bond, providerAgentId, specHash, committee})` | client             | not the client; job not Open; `bond < minBond`; committee member is zero, the client, or repeated | `Configured`        |
| 1c  | `ARLJobs.setBudget(jobId, budget, "")`                                                                                                    | client or provider | job not Open                                                                                      | `BudgetSet`         |
| 1d  | `ARLVerifiedEvaluator.approveCommittee(jobId)`                                                                                            | provider           | not the provider; the provider is in the committee                                                | `CommitteeApproved` |
| 1e  | `ARL.approve(ARLJobs, budget)` then `ARLJobs.fund(jobId, budget, "")`                                                                     | client             | not the client; provider not set; budget 0 or changed; expired                                    | `JobFunded`         |

1a and 1b are `openVerifiedJob` in `@arl/sdk` today; 1c and 1d are the provider's, so the service calls
them when it accepts the 402 terms (as in `packages/verifier/examples/quickstart.ts`).

### Step 2: committee accepts (validators)

`ARLVerifiedEvaluator.accept(jobId)` by each member: reverts unless the committee is approved by
the provider, the job is Funded and the member's free stake covers the bond. Locks `bond` ARL of
the member's stake. Event `Accepted`. `arl-verifier watch` does this unattended.

### Step 3: work and submit (provider)

The provider runs the spec, writes the result manifest (`arl-reexec-result/1`) and calls
`ARLJobs.submit(jobId, deliverable, "")` (provider only, job Funded, not expired). Event
`JobSubmitted`.

### Step 4: re-execute and vote (validators)

`startVoting(jobId)` (anyone, job Submitted) opens the vote window. Each accepted member
re-executes from the pinned spec and calls `vote(jobId, approve, deliverable, evidence)`; an
approval must name the same deliverable as the first approval (`DeliverableMismatch`). On
`threshold` approvals the verdict is **Approved**; when approval becomes impossible it is
**Rejected**. Either starts the challenge window. If the window closes undecided,
`closeUndecided` refunds the client and burns the bonds of members who accepted but did not
vote. Events `Voted`, `Decided`, `Failed`.

### Step 5: challenge (anyone)

During the challenge window anyone may `dispute(jobId, evidence)`, posting a bond in ARL. The
arbiter Safe then calls `resolve(jobId, approve, reason)`: a wrong committee loses its bonds to
`dEaD`; a wrong challenger loses theirs. Events `Disputed`, `Resolved`, `Slashed`.

### Step 6: settle (anyone)

After the challenge window, `finalize(jobId)` calls `ARLJobs.complete` (provider paid in ARL)
or `ARLJobs.reject` (client refunded), unlocks the bonds and writes the outcome to the ERC-8004
reputation registry for `providerAgentId`. Events `Finalized`, `JobCompleted` /
`JobRejected`, `PaymentReleased`. A job that expires first is refunded by `claimRefund`.

### Step 7: evidence (anyone)

`arl-verifier bundle` builds an `arl-evidence/1` bundle from these events; `verify-bundle`
checks it against any RPC (`packages/verifier/src/bundle.ts`).

## 3. Gaps before v0.2.0 can be normative

1. **One signature for the client.** Steps 1a, 1b and 1e are four transactions (with the approve) from
   the client, and the client needs ETH for gas. x402 `upto` needs neither. Two options:
   - _A, no new contract:_ keep the client as the `ARLJobs` client and batch 1a, 1b and 1e in one
     EIP-5792 `wallet_sendCalls` (smart account) or an EIP-7702 delegation. Recommended for
     v0.2.0: no new audit surface.
   - _B, a router:_ a contract that takes a Permit2 signature and opens, configures and funds
     in one call. Today `ARLJobs` records `msg.sender` as the client, so a router would become
     the client of every job and could configure or reject it; that needs a client field in a
     new escrow version. Deferred.
2. **The provider's approval (1d) is a separate transaction** by the service. The 402 response
   should carry a provider signature over the configuration instead; that needs an evaluator
   change and is deferred.
3. **Paying in ARL.** An agent that holds USDC or ETH must buy ARL first. The SDK should quote
   and swap through the ARL Uniswap v3 pools (docs/mainnet-plan.md) in the same batch as 1e.
4. **Base Mainnet deployment.** `ARLJobs` and `ARLVerifiedEvaluator` are prepared for Base
   Mainnet (docs/mainnet-services.md) and not deployed yet.
5. **Validators.** The committee needs independent, staked validators on Base Mainnet before
   the flow is useful there.

## 4. What stays out of v0.2.0

Per-second compute streams (`ComputePayment`), anonymous polls (`ARLAnonymousSignal`) and
staking rewards (`ARLStakingRewards`) are separate products today and are not part of this
scheme. They may build on it later.
