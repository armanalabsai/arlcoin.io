# Testnet operator API: security model

The ARL app on Base Sepolia uses a small server, the **testnet operator**, to do what development
accounts do on a local chain: hand out testnet ARL, add members to the demo poll group, relay
anonymous votes and settle x402 `upto` payments to its own demo service. It runs at
`https://app.arlcoin.io/api/operator/*` and is built from
[`apps/dapp/app/api/operator/[action]/route.api.ts`](../apps/dapp/app/api/operator/%5Baction%5D/route.api.ts),
[`apps/dapp/lib/server/operator.ts`](../apps/dapp/lib/server/operator.ts) and the request rules in
[`apps/dapp/lib/operatorRules.ts`](../apps/dapp/lib/operatorRules.ts).

**Scope: Base Sepolia only.** Testnet tokens have no value. The operator refuses every chain other
than 84532, and no Base Mainnet contract depends on it.

## What the operator is trusted with

| Asset                     | Held by the operator                        | Worst case if the key leaks                                               |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Testnet ARL float         | Up to the float the Ecosystem Safe sends it | The testnet float is drained; no user funds, no mainnet funds             |
| Testnet ETH for gas       | A small amount                              | Gas is spent                                                              |
| Demo poll group (admin)   | Admin of the demo group it created          | Members can be added to the demo group; votes already cast stay valid     |
| Demo service payee (x402) | Settles only payments to its own service    | It can settle authorizations signed to it, never above the signed ceiling |

The operator never holds user funds. Users keep custody: a payment can move at most the ceiling
the payer signed, to the payee named in the signature, once.

## Key handling

- The private key comes only from the host's runtime environment (`ARL_OPERATOR_KEY`, a GitHub
  Actions secret passed to the Vercel deployment). It is never written to the repository, a build
  artefact or a log; the deploy script refuses to ship an output that contains an `.env` file.
- `operatorKey()` accepts the 64-hex-digit key with or without `0x` and reports a misconfiguration
  without echoing the value.
- The operator is a dedicated testnet account (`0x26DEAaCAa112cA495bD7CC8Cb92c91cD85e1A2a0`) with
  no admin role on any ARL contract.

## Per-action rules

| Action   | Authentication                                                        | Limits and checks                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status` | None (read only)                                                      | Returns the operator address and balances                                                                                                                                                 |
| `faucet` | None                                                                  | 1,000 testnet ARL per address per 43,200 blocks (about 24 hours), checked against on-chain transfer logs, so a restart cannot reset it; never to the operator itself                      |
| `join`   | Signature of a fixed message by the joining account (`verifyMessage`) | The account must already hold testnet ARL; only the demo group                                                                                                                            |
| `relay`  | The zero-knowledge proof itself                                       | Only the demo poll scope; the call is simulated on chain first and refused if the contract would revert (invalid proof, reused nullifier)                                                 |
| `settle` | The payer's Permit2 `upto` signature                                  | x402 version 2, scheme `upto`, Base Sepolia, asset ARL, payee = the operator's own service; verified against the signed ceiling, then the metered amount (never above it) is settled once |

Every body is size-limited (`MAX_BODY_BYTES`, 64 KB), parsed into typed values and rejected with
a 4xx error before any transaction is built. Unexpected errors return a generic 500 and are logged
server-side without request bodies.

## Browser access

Responses carry CORS headers only for the website origins (`https://arlcoin.io`,
`https://www.arlcoin.io`, or `ARL_OPERATOR_ORIGINS`). CORS is not authentication: the rules above
hold for any caller.

## Known limits

- **Centralised helper.** The faucet, relayer and settlement service are run by one testnet
  account. If it is down, the app's faucet, anonymous voting and paid demo service stop; the
  contracts keep working and anyone can call them directly.
- **No IP rate limiting.** Abuse is bounded by the on-chain per-address faucet window and the
  float the operator holds, not by request rate. Vercel's platform limits apply.
- **Relayer censorship.** The relayer can refuse to submit a vote. Votes remain valid if anyone
  else submits them to `ARLAnonymousSignal`.
- **Nonce races.** Concurrent requests can race for the next nonce; the API answers 503 and the
  client retries.

## Tests

- Request rules: [`apps/dapp/test/unit/operatorRules.test.ts`](../apps/dapp/test/unit/operatorRules.test.ts)
- End to end against a Base Sepolia fork (faucet window, join, relay, settle):
  [`apps/dapp/test-fork/operator.fork.test.ts`](../apps/dapp/test-fork/operator.fork.test.ts)
