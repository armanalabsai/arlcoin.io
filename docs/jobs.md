# Jobs: escrowed work paid in ARL (ERC-8183)

Status: **IN DEVELOPMENT.** Written and tested on a local chain; not deployed; not externally
audited.

A client hires a provider (for example an AI or compute service listed on
[ARL Network](app.md#network-erc-8004)) for a piece of work and pays in ARL through escrow. This is
the Agentic Commerce standard, [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) (Draft), which
is designed to work with ERC-8004 identities and x402 payments.

## How it works

| Step     | Who                                       | What happens                                                                         |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Post     | Client                                    | Creates the job: provider, evaluator, deadline, description. Status **Open**         |
| Price    | Client or provider                        | Proposes the budget (`setBudget`); either can change it while the job is Open        |
| Fund     | Client                                    | Escrows exactly the agreed budget; fails if the budget changed meanwhile. **Funded** |
| Deliver  | Provider                                  | Submits a reference to the result (a hash) before the deadline. **Submitted**        |
| Evaluate | Evaluator                                 | Accepts (the provider is paid, **Completed**) or rejects (the client is refunded)    |
| Expire   | Anyone, after the deadline                | Returns the budget of a Funded or Submitted job to the client. **Expired**           |
| Cancel   | Client (while Open) or evaluator (funded) | **Rejected**; a funded budget goes back to the client                                |

The evaluator is chosen by the client when the job is posted. It can be the client, another
account or a contract (for example one that checks a proof). Once work is submitted only the
evaluator decides, so a client cannot take the budget back after the provider has delivered;
the deadline is the provider's and the client's protection against an evaluator that never acts.

## Contract

`contracts/src/ARLJobs.sol` (Apache-2.0) follows the ERC-8183 state machine, roles, events and
function signatures. ARL choices:

- One payment token, fixed at deployment (ARL).
- No owner, no upgrade and no fees: the contract has no privileged role.
- No hooks: `hook` must be `address(0)`, which the standard allows; `optParams` are accepted and
  ignored.
- `fund` requires the expected budget, as the standard requires (the reference contract omits it).
- A provider can only submit before the deadline; a job must run at least 5 minutes; descriptions
  are at most 1,024 bytes.
- Reentrancy guard on every function that moves tokens; SafeERC20.

## App

The Jobs screen (`apps/dapp/app/jobs`) posts a job to a service from ARL Network (or any
address), funds it with an approval of exactly the budget, and shows every job the wallet is part
of with the actions its roles allow. On the local chain it can also play a provider or evaluator
that is an Anvil development account (unlocked by the node; no key in the app), so the whole flow
can be tried with one wallet. Results are referenced on-chain by their keccak256 hash only.

## Ratings (ERC-8004 reputation)

After a paid job has ended (completed, rejected after funding, or expired), its client can rate
the provider's ERC-8004 agent from 1 to 5 stars. The rating is written to the canonical ERC-8004
ReputationRegistry (`0x8004B663…8713` on Base Sepolia) with `giveFeedback`: tag1 `starred` with a
0-100 value, as the standard suggests, and tag2 `arl-job`. The feedback file (on-chain, as a base64
JSON data URI; its keccak256 is the feedback hash) follows the standard's structure and names the
job.

Anyone can write feedback to the registry, so a plain average is easy to fake. The app counts a
rating only if its file points to a funded `ARLJobs` job that has ended, whose client wrote the
rating and whose provider is the rated service's payee; the file and the event must agree and the
hash must match. One rating per job counts: the latest, unless it was revoked. ARL Network shows
the result as "Rated N/100 from M paid jobs" (`apps/dapp/lib/reputation.ts`).

## Tests

| Suite      | Command                                        | Covers                                                                                                                                                    |
| ---------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `forge test --match-contract ARLJobsTest`      | Every transition and who may make it; refused inputs; changed budget not funded; deadlines; terminal states final; escrow goes to exactly one side (fuzz) |
| Invariant  | `forge test --match-contract ARLJobsInvariant` | The contract holds exactly the Funded and Submitted budgets; every funded token is escrowed, paid or refunded; supply conserved                           |
| App unit   | `npm test` in `apps/dapp`                      | Status names, roles, allowed actions, input validation                                                                                                    |
| End to end | `npm run test:e2e` in `apps/dapp`              | Post, fund, deliver, accept and pay; reject and refund; refund after the deadline, with balances checked on-chain                                         |

## Not yet

- Disputes or arbitration (the standard has none; reject and expiry are final).
- Responses from providers to ratings (`appendResponse`) and revoking a rating from the app.
- Gasless use through ERC-2771 and a facilitator.
