# x402 scheme `arl-escrow`, v0.2.0

Status: **released**, 2026-11-20. This is the wire format the ARL TypeScript SDK speaks
(`payVerified` on the paying side, `payOnProof` on the selling side) against the contracts live on
Base Mainnet. The earlier draft, [v0.2.0-draft/flow.md](../v0.2.0-draft/flow.md), keeps the
step-by-step contract calls.

## Why another scheme

The `exact` scheme of x402 pays before the client has seen anything: the money moves when the
request is made. That fits a cheap API call. It does not fit a job whose result the buyer cannot
judge in the moment (an agent's research, a model run, a build): the buyer needs a way not to pay
for bad work, and the seller needs to know the money exists before starting.

`arl-escrow` keeps the negotiation of x402 (a `402` response that states the terms) and changes
what "paid" means: the client locks the price in an ERC-8183 escrow, the service does the work,
and a staked committee named in the terms checks the result before the escrow pays the service.
If the committee rejects the work, or nobody delivers, the client is refunded.

|                 | `exact`                      | `arl-escrow`                                |
| --------------- | ---------------------------- | ------------------------------------------- |
| Money moves     | with the request             | after the result is verified                |
| Buyer's risk    | pays for whatever comes back | refunded when the committee rejects         |
| Seller's risk   | none                         | paid only for work that verifies            |
| Settlement time | one transaction              | the vote and challenge windows in the terms |
| Suited to       | calls priced in cents        | jobs worth checking                         |

## 1. Terms: the `402` response

A service that sells through this scheme answers a request that carries no job with
`402 Payment Required` and a JSON body in the x402 version 2 shape:

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "arl-escrow",
      "network": "eip155:8453",
      "amount": "25000000000000000000",
      "payTo": "0x5CD1...service",
      "extra": {
        "jobs": "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC",
        "evaluator": "0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28",
        "specUri": "https://service.example/specs/summarise.json",
        "specHash": "0x...32 bytes",
        "committee": ["0x...", "0x...", "0x..."],
        "threshold": 2,
        "voteWindow": "3600",
        "challengeWindow": "86400",
        "bond": "100000000000000000000",
        "expiresIn": "259200"
      }
    }
  ]
}
```

| Field                                       | Meaning                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `network`                                   | CAIP-2 id of the chain the escrow is on.                                                                           |
| `amount`                                    | The price, in base units of the escrow's payment token. A decimal string.                                          |
| `payTo`                                     | The service's address: the provider of the job, paid when the job is approved.                                     |
| `extra.jobs`                                | The ERC-8183 escrow (`ARLJobs`). Its payment token is the token the price is in.                                   |
| `extra.evaluator`                           | The evaluator that settles the job (`ARLVerifiedEvaluator`).                                                       |
| `extra.specUri`, `extra.specHash`           | Where the job specification is, and its 32-byte hash. The committee checks the result against this specification.  |
| `extra.committee`, `extra.threshold`        | The validators that will check the result, in order, and how many approvals decide.                                |
| `extra.voteWindow`, `extra.challengeWindow` | Seconds the committee has to vote, and seconds anyone may dispute the verdict before it settles. Decimal strings.  |
| `extra.bond`                                | Stake each committee member locks on the job, in base units of the evaluator's stake token. A decimal string.      |
| `extra.expiresIn`                           | Seconds the job may stay open before the client can take a refund. A decimal string.                               |

A client MUST refuse terms whose `network` is not the chain it is on, or whose `amount` is zero or
above the most it is willing to pay. A client SHOULD refuse an escrow or evaluator it does not
know, and SHOULD check that the document at `specUri` hashes to `specHash` before it pays.

## 2. Payment: a funded job

The client pays by opening a job that matches the terms and funding it:

1. `createJob(payTo, evaluator, now + expiresIn, description, 0x0)` on the escrow.
2. `configure(jobId, ...)` on the evaluator with the `specHash`, `committee`, `threshold`,
   `voteWindow`, `challengeWindow` and `bond` of the terms.
3. `setBudget(jobId, amount, "")`, an approval of the payment token, and `fund(jobId, amount, "")`.

It then repeats the request with one header:

```
X-ARL-Job: <chain id>:<escrow address>:<job id>
```

for example `X-ARL-Job: 8453:0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC:17`. There is no signature
to pass: the proof of payment is the job's state on chain.

## 3. Verification by the service

Before doing any work the service MUST read the job and its configuration and check that:

- the header's chain and escrow are the ones in its terms;
- the job's status is Funded;
- the job's provider is `payTo`, its evaluator is `extra.evaluator` and its budget is `amount`;
- the configured `specHash`, `threshold` and `committee` (same members, same order) are those of
  the terms;
- the time left before the job expires covers the vote and challenge windows.

If a check fails the service answers `402` again with the terms and an `error` string.

A job pays for one run. The service MUST record a job as used before it starts the work and
answer `409` to a second request that names the same job. A service with more than one instance
keeps that record in a store they share.

## 4. Work, response and settlement

1. The service calls `approveCommittee(jobId)` on the evaluator. This is its on-chain acceptance of
   the committee the client configured; without it no validator can take the job.
2. The service does the work and answers the request. The response carries two headers:

   ```
   X-ARL-Job: <as sent>
   X-ARL-Deliverable: <32 bytes, 0x-prefixed hex>
   ```

   The deliverable is the 32-byte value the committee will check (for a re-execution job, the
   hash of the result manifest).

3. Once `threshold` committee members have accepted the job, the service calls
   `submit(jobId, deliverable, "")` on the escrow.
4. The committee re-checks the work against the specification and votes. `threshold` approvals
   for the same deliverable approve the job; the challenge window follows; then anyone may call
   `finalize(jobId)`, which pays `payTo` or refunds the client and writes the outcome to the
   ERC-8004 reputation registry.

The client has the result as soon as step 2 answers. What it has not yet done is pay for it: the
money stays in escrow until step 4. A client that needs the verdict before using the result reads
the job's state (`getVerdict` in the SDK).

## 5. What each side trusts

- **The client** trusts the escrow and evaluator contracts (ownerless, source verified) and that
  fewer than `threshold` committee members collude with the service. It can dispute a verdict
  during the challenge window by posting a bond; an arbiter then rules and the losing side's
  bonds are burned.
- **The service** trusts the same contracts and that the committee does not wrongly reject. It
  chose the committee: the terms are its own.
- **Neither side** trusts the other, and no facilitator holds the money.

A service that answers and then never submits is not paid: the job expires and the client takes
the refund. A client cannot take the money back while a submitted job is being judged.

## 6. Deployments and reference code

| Network                     | Escrow (`jobs`)                              | Evaluator                                    | Payment token |
| --------------------------- | -------------------------------------------- | -------------------------------------------- | ------------- |
| Base Mainnet, `eip155:8453` | `0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC` | `0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28` | ARL           |
| Base Mainnet, `eip155:8453` | `0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04` | `0x7A00D45598Da7C13feEA8962fc1110FC4Db4D850` | USDC          |

- Paying side: `payVerified` in
  [packages/sdk/src/payVerified.ts](../../../packages/sdk/src/payVerified.ts).
- Selling side: `payOnProof` and `expressPayOnProof` in
  [packages/sdk/src/payOnProof.ts](../../../packages/sdk/src/payOnProof.ts), with the checks of
  section 3 in [escrowProvider.ts](../../../packages/sdk/src/escrowProvider.ts).
- A complete job on the ARL escrow: job 1
  ([specification](../../../apps/web/public/jobs/first-verified-job/spec.json)).

## 7. Known limits of this version

- The client sends several transactions and needs gas. One signature for the whole payment needs
  a batched call (EIP-5792 or EIP-7702) or a router contract; neither is part of this version.
- The terms do not carry the `asset` field of x402: the payment token is read from the escrow. A
  later version will state it in the terms as well.
- The service's acceptance of the committee is a transaction of its own (step 1 of section 4).
- Settlement takes the vote and challenge windows, so the scheme does not suit calls that must
  settle in seconds; `exact` does.
