# ARL token utility and protocol economics

Status: **Phase 3 proposal**, 14 November 2026, for owner approval. Phase 3 of the
[master architecture and roadmap](../architecture/MASTER-ARCHITECTURE-ROADMAP.md). Allocation
numbers come only from [`packages/tokenomics`](../../packages/tokenomics/src/allocations.ts).
Nothing here changes a contract; items that would need a contract change say so.

## What ARL does today (on chain, live)

| Role                     | Where                                         | How                                                                                                                         |
| ------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Escrow currency          | `ARLJobs` (ARL) `0x4664…98f9`                 | The client locks the budget in ARL; it goes to the provider on approval or back to the client on rejection or expiry        |
| Validator stake and bond | `ARLVerifiedEvaluator` v4 (ARL and USDC jobs) | Validators stake ARL; each accepted member locks `max(floor, budget / 10)`; mainnet floor 100 ARL                           |
| Penalty                  | Same                                          | Wrong approvals overturned by a dispute, failed challenges and absences burn bonds to `0x…dEaD` (supply leaves circulation) |
| Compute payment          | `ComputePayment` `0x1bFE…E464`                | Per-second streams paid in ARL                                                                                              |
| Staking                  | `ARLStakingRewards` `0x15e2…a102`             | Stake ARL, earn rewards from funded periods (180 days each); no period funded yet                                           |

ARL has a fixed supply of 21,000,000 with no mint function. No contract takes a protocol fee today.

## Allocations that fund the protocol

| Allocation          | Amount    | Status in `packages/tokenomics` | Proposed use (this document)                                                       |
| ------------------- | --------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Community & Staking | 3,000,000 | program, rules undecided        | Staking reward periods; validator bootstrap rewards                                |
| Early Users         | 1,100,000 | program, rules undecided        | Rewards for verified, paid jobs (clients and providers), never for wallet connects |
| Ecosystem & Growth  | 2,000,000 | program, rules undecided        | Integration bounties for platforms and builders                                    |
| Grants / Bug Bounty | 400,000   | bounty live, grants undecided   | Security bounties (live) and developer grants                                      |

## Proposals

### P-1. First staking period

Fund the first 180-day period with 300,000 ARL from Community & Staking (already prepared in
`docs/mainnet-services.md`, step 4). About 6.11 ARL is already staked with no rewards running
([baseline](../baseline.md)). Owner action: two signatures on the Community & Staking Safe.

### P-2. Validator bootstrap (no contract change)

Validators are not paid by the contract yet (a fee at `configure` is designed in
`docs/verifiable-execution.md`, Phase 2). Until then:

- the first committee is operator-run (roadmap decision D-2);
- for each job where a validator voted on the final side, it earns a reward from Community &
  Staking, computed off chain from `arl-evidence/2` bundles and paid by the Safe per period;
- proposed rate: 2 % of the job budget in ARL per final-side vote, capped at 20 ARL per vote and
  10,000 ARL per period, so rewards cannot exceed the work they verify.

### P-3. Early Users rewards tied to verified outcomes (no contract change)

A client or provider earns only from **completed, verified jobs** read from the evaluator's
outcomes (`arl-reputation/1` inputs): a proposed 5 % of the job budget in ARL to each side, capped
per address per period, with the reputation rules' per-client cap applied so self-dealing does not
pay. Expired, failed and rejected jobs earn nothing. Connecting a wallet earns nothing, as the
allocation already states.

### P-4. Integration grants (no contract change)

From Ecosystem & Growth: a fixed ARL grant for each shipped integration that completes at least
10 verified paid jobs with distinct clients (for example an AgentKit plugin, an MCP server used by
an agent platform, a marketplace). Paid after the jobs are visible in evidence bundles.

### P-5. Validator fee in the contract (contract change, later)

The designed fee at `configure`, split among voters on the final side, replaces P-2. It needs a new
evaluator deployment and is scheduled with Phase 8, not before the pilot.

## Incentive check

| Actor      | Honest strategy               | Cheating strategy                     | Why honest dominates                                                                                                                                                                  |
| ---------- | ----------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validator  | Check and vote per the policy | Approve bad work for a bribe          | Policy `reexec-standard` and `model-assisted-review` require `threshold × bond ≥ budget` for ARL tasks: corrupting a decision costs at least the budget in burned bonds once disputed |
| Validator  | Vote within the window        | Accept and stay away                  | `closeUndecided` burns absentees' bonds                                                                                                                                               |
| Challenger | Dispute wrong decisions       | Spam disputes                         | A failed dispute burns the challenger's bond                                                                                                                                          |
| Client     | Fund and judge fairly         | Collude to fake reputation or rewards | Rewards and reputation count only evaluator outcomes, capped per client; every job still locks a real budget and bonds                                                                |
| Provider   | Deliver on time               | Take jobs and not deliver             | Expired jobs count as 0 in reputation and earn nothing                                                                                                                                |

Limits stated plainly: USDC jobs are bonded in ARL, so "bond covers budget" needs a price and is not
enforced for them; until validators are independent (Phase 8), the operator-run committee is a
trust assumption, disclosed in the pilot.

## Owner decisions needed

1. Approve P-1 (and sign it).
2. Approve P-2 and P-3 rates or set others.
3. Approve P-4 grant size.
