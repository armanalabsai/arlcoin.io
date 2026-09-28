# ARL Payments (x402 `upto`)

Status: **IN DEVELOPMENT.** Integration code and tests only. Nothing is deployed, no facilitator
runs, and ARL itself is not deployed. Base Mainnet is refused by the code.

ARL payments let an AI or compute service charge per use in ARL. They use the `upto` scheme of
the x402 protocol: the payer signs a **ceiling**, the service meters actual usage, and the
facilitator settles the metered amount, never more than the ceiling.

## Path

```
payer wallet ── signs Permit2 witness (ceiling, payee, facilitator, nonce, deadline)
     │           and, first time only, an ARL EIP-2612 permit approving Permit2
     ▼
facilitator ── x402UptoPermit2Proxy.settle / settleWithPermit(amount ≤ ceiling)
     │
     ▼
Permit2.permitWitnessTransferFrom ── ARL.transferFrom(payer → payee, amount)
```

ARL's EIP-2612 permit is only used to approve Permit2 (x402's `eip2612GasSponsoring`); the payment
itself is always the Permit2 witness transfer.

## External contracts and pins

| Item                  | Value                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network               | Base Sepolia, CAIP-2 `eip155:84532`. Base Mainnet (8453) refused by `paymentNetwork`                                                                                                                                                                                                                    |
| Permit2               | `0x000000000022D473030F116dDEE9F6B43aC78BA3`, Base Sepolia code hash `0xdcde65555316946c298e4c60c6213eb5c3aeab4354d1f3fac5427236bcbb9ebe`                                                                                                                                                               |
| x402UptoPermit2Proxy  | `0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002`, code hash `0x4662dc27323421a3698be49ac95f7b0dba141c238d31ef543248d1a11f8d8eec` (same on Base Sepolia and Base Mainnet; identical to a build of the source below)                                                                                          |
| x402 source           | x402-foundation/x402 @ `71eb9a55e081e7b81ba3046d0bd17c3eb9c7bf81` (npm `@x402/core` and `@x402/evm` 2.27.0), Apache-2.0; contracts MIT                                                                                                                                                                  |
| Audits of the proxies | Cantina, Feb 2026 (commit `c0a80b76`: 3 low, 4 informational, all fixed) and Mar 2026 (commit `79136b97`: 1 informational on the _exact_ proxy, acknowledged). The May 2026 report covers only the separate batch-settlement contract. Reports are in the x402 repository under `contracts/evm/audits/` |
| Fork block            | Base Sepolia 47,419,967                                                                                                                                                                                                                                                                                 |

`assertPinnedCode` checks both code hashes before use.

## Guarantees

Enforced by the proxy and Permit2 (tested on the fork, `contracts/test-fork/`):

- settlement ≤ signed ceiling (`AmountExceedsPermitted`); zero settlement reverts (`InvalidAmount`);
- payee, facilitator, token, ceiling, nonce and deadline are covered by the payer's signature;
- only the named facilitator can settle (`UnauthorizedFacilitator`);
- each Permit2 nonce is usable once (`InvalidNonce`); the payer can revoke with
  `invalidateUnorderedNonces`;
- the Permit2 domain includes the chain id, so a signature for another chain fails.

Added by `@arl/payments` (`packages/payments`):

- **Network gate**: Base Sepolia only; Base Mainnet refused, no override.
- **Asset and spender pin**: only ARL, only through the pinned upto proxy.
- **One settlement per authorization**: a shared `AuthorizationStore` records every
  authorization (payer + nonce) as `settling`, `settled`, `retired` or `failed`, claimed before
  anything is sent, so concurrent or repeated requests settle at most once.
- **Zero settlement**: the SDK returns success without a transaction, which leaves the Permit2
  nonce unused and the ceiling spendable until its deadline. ARL records it as `retired` and never
  settles it afterwards.
- **Short windows**: requirements allow 30–600 seconds; authorizations expiring more than 600
  seconds ahead, or already expired, are refused.
- **Failures are not retried** with the same authorization; the payer signs a new one.

## Known limitations

- **Facilitator trust.** The facilitator chooses the settled amount (up to the ceiling). Payers
  trust the service's metering for that amount; the ceiling bounds the loss.
- **Residual allowance.** An EIP-2612 permit approves Permit2 for the whole ceiling; after a
  partial settlement the rest stays approved to Permit2 (usable only with a new valid Permit2
  signature from the payer).
- **Shared store.** `InMemoryAuthorizationStore` is for tests and single-process use. Several
  facilitator instances must share a durable store with compare-and-set semantics.
- **Facilitator key and gas.** Running a facilitator needs a signing key with ETH for gas on Base
  Sepolia. Not created; an owner decision.
- ARL is not deployed; `arlToken` must come from the deployment manifest.

## Tests

| Suite               | Command                                                                                                | Covers                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                | `npm test -w @arl/payments`                                                                            | network gate, pinned-code check, requirements, metering, settlement policy, facilitator wrapper (with a stand-in SDK scheme)                                                     |
| Contract fork       | `FOUNDRY_PROFILE=fork ARL_FORK_RPC=<Base Sepolia RPC> forge test` in `contracts/`                      | the 15 agreed cases against the real Permit2 and proxy, fuzzing both sides of the ceiling, EIP-2612 → Permit2 (gasless, front-run, value mismatch), pinned code                  |
| SDK end-to-end fork | `ARL_FORK_RPC=<Base Sepolia RPC> npm run test:fork -w @arl/payments` (needs `forge build` and `anvil`) | real `@x402/evm` client and facilitator through `ArlUptoFacilitator` on a local Anvil fork: verify, metered settlement, replay refusal, ceiling, zero retirement, tampered payee |

Fork tests read chain state only; every transaction stays in the local fork.
