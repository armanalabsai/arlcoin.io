# Run a validator

Anyone can check verified jobs on ARL. A validator stakes ARL on the verified evaluator, is named
on a job's committee by the buyer and approved by the seller, re-runs the work and votes. No
permission, registration or approval from the ARL team is involved: the contract accepts any
account that has staked.

This page is everything an independent operator needs: what is at stake, what to install, and the
commands.

## What a validator does, and what it risks

1. **Stake.** Deposit ARL on the evaluator. The stake stays yours and can be withdrawn at any
   time, except the part locked in jobs you have accepted.
2. **Accept.** When a buyer names your address on a committee and the seller approves it, you
   accept the job. That locks a bond from your stake: the larger of the job's floor (100 ARL or
   more) and a tenth of the budget.
3. **Re-execute and vote.** The job's spec says exactly what to run. You run it in the pinned
   container, compare your result hash with the seller's deliverable, and vote to approve or
   reject.
4. **Get the bond back.** When the job is finalized after its challenge window, the bond is
   unlocked.

What can cost you the bond:

- **A wrong approval.** If someone disputes within the challenge window and the ruling overturns
  the committee, the validators who approved lose their bonds. Bonds are burned; nobody receives
  them.
- **Not voting.** A validator that accepts a job and does not vote within the vote window loses
  its bond, and the buyer is refunded.

A validator that votes what it actually computed, on time, does not lose its bond. The contract
does not pay validators a fee today; the full budget of a job goes to the seller or back to the
buyer.

Every validator's record is public: stake, locked bonds, jobs accepted, votes and slashes, at
[arlcoin.io/api/v1/validators](https://arlcoin.io/api/v1/validators) and on ARLscan in the app.
That record is what a buyer reads before naming a committee.

## What you need

- A machine that stays on: any Linux, macOS or Windows host with Node.js 24 and Docker.
- An account used only for validating, with its private key on that machine.
- On Base Mainnet, in that account: at least 100 ARL for one job at a time (300 ARL lets you sit
  on three jobs at once), and a little ETH for gas. A vote costs cents.
- A Base RPC endpoint. A public one works; your own is more reliable.

## Try it locally first

The quickstart runs three unattended validators through a complete job on a local chain, with no
funds and no key of yours:

```sh
git clone https://github.com/armanalabsai/arlcoin.io && cd arlcoin.io
npm ci
(cd contracts && forge build)
npm run quickstart -w @arl/verifier
```

It needs Foundry (`anvil`, `forge`). The validators in that run are the same code you run below
([quickstart.md](quickstart.md)).

## Stake

Open [arlcoin.io/app/verified](https://arlcoin.io/app/verified/) with the validator account and
use **Stake as a validator**. The page shows your stake, the part locked in jobs, and the
evaluator's minimum bond. It calls `stake(amount)` on the evaluator after an approval of exactly
that amount.

The evaluators on Base Mainnet, both staked in ARL:

| Jobs paid in | Evaluator                                    |
| ------------ | -------------------------------------------- |
| ARL          | `0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28` |
| USDC         | `0x7A00D45598Da7C13feEA8962fc1110FC4Db4D850` |

Stake on the one whose jobs you want to check. To withdraw, use **Unstake** on the same page:
`unstake(amount)` returns any stake that no accepted job has locked.

## Run

```sh
ARL_VALIDATOR_KEY=0x<the validator account's private key> \
  node packages/verifier/src/cli.ts watch \
  https://mainnet.base.org 0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28 -20000
```

`watch` runs unattended. Every 15 seconds it accepts the funded jobs whose committee names your
address, and votes on the ones that have been submitted. It fetches each job's spec from the job
itself, refuses a spec whose hash differs from the one committed on chain, re-runs it in Docker
and votes on what it computed. Progress is kept in `.arl-verifier-state.json`, so a restart
continues where it stopped. `-20000` starts 20,000 blocks back from the head.

The key is read from the environment only, never from an argument, and is never printed. Keep it
in your service manager's secret store, and keep only validator funds in that account.

What your validator accepts is yours to set, through the environment:

| Variable                | Meaning                                                     | Default           |
| ----------------------- | ----------------------------------------------------------- | ----------------- |
| `ARL_MAX_BOND`          | Largest bond locked for one job, in base units              | 100 ARL           |
| `ARL_MIN_BUDGET`        | Smallest job budget accepted, in the escrow token's units   | At least the bond |
| `ARL_MAX_DEADLINE_DAYS` | Longest time until a job's deadline (how long a bond locks) | 30                |
| `ARL_MIN_VOTE_MINUTES`  | Shortest vote window you will work under                    | 60                |
| `ARL_CLIENTS`           | Only accept jobs from these buyer addresses                 | Any buyer         |

For the USDC evaluator set `ARL_MIN_BUDGET` (USDC has 6 decimals: `1000000` is 1 USDC), because a
USDC budget cannot be compared with an ARL bond; until it is set nothing is accepted there.

Run it under a service manager (systemd, pm2, a Windows scheduled task) so it restarts with the
machine. A validator that is offline simply accepts nothing; one that has accepted a job must be
online to vote within the vote window.

## Get named on a committee

A buyer chooses the committee and the seller approves it, per job. Once you are staked and
running:

- your address appears in the public validator list with its record;
- tell the services and buyers you work with to name it. A service that sells through
  `payOnProof` lists its committee in its offer, so a seller can simply add you;
- a committee holds up to seven validators, and a job needs a strict majority of at least two.

## Reward for the first independent validators

The contract pays validators nothing, so for the first independent operators the project does:

- **250 ARL per month** to each of the first five validators that are not run by the ARL team.
- To qualify in a month: at least 1,000 ARL staked on an evaluator for the whole month, the
  validator running throughout, and a vote cast in time on every job that named it.
- The stake stays yours; the reward is on top of it.
- Paid on the 20th of each month from the Grants & Bug Bounty Safe, for the three months
  starting December 2026. The programme is then reviewed.

To take one of the five places, stake, start `watch`, and send the validator address to
team@arlcoin.io or post it in the developer chat. Places go in the order the stake appears on
chain.

## Check a job yourself

Whether or not you validate, any job can be re-checked from its evidence:

```sh
node packages/verifier/src/cli.ts bundle <rpc> <evaluator> <jobId> <fromBlock> > evidence.json
node packages/verifier/src/cli.ts verify-bundle <rpc> evidence.json <fromBlock>
```

`verify-bundle` re-reads every field from the chain and exits 1 on any mismatch.

## Reference

- How a job is verified, the windows, bonds, disputes and the threat model:
  [verifiable-execution.md](verifiable-execution.md)
- The job spec format and the reference verifier: [reexecution-spec.md](reexecution-spec.md)
- Contracts and addresses: [mainnet-services.md](mainnet-services.md)
- Questions: team@arlcoin.io or the developer chat at
  [t.me/arlprotocol_community](https://t.me/arlprotocol_community)
