# Whitelist entry by wallet signature

Code: [`packages/deploy/src/pop.ts`](../packages/deploy/src/pop.ts), tests
[`pop.test.ts`](../packages/deploy/test/pop.test.ts). It changes no contract, no existing
function and no existing form.

## Flow

1. The user signs an EIP-712 `Entry(wallet, nonce, expiresAt)` message (domain `ARL Whitelist`,
   version 1) in their wallet. The nonce is 32 random bytes; `expiresAt` is at most 15 minutes away.
2. A server calls `verifyEntry`. It checks the input shape, the expiry, the signature (viem
   `recoverTypedDataAddress`) and records the nonce once. A forged signature never consumes a nonce.
3. It returns `commitment = keccak256(abi.encode("ARL Whitelist v1", wallet))`, which is what is
   stored or published instead of the address.

## What it does and does not give

- No email or personal data is part of the message. The server still sees the request's network
  metadata; this is "no personal data collected by ARL", not anonymity from the operator.
- A commitment of a public address can be checked against a list of known addresses, so it makes a
  published list unreadable as addresses but not unlinkable. For unlinkable membership use the
  Semaphore-based `ARLAnonymousSignal` ([zk-privacy.md](zk-privacy.md)).
- Nothing is written to a chain yet. Publishing commitments on Base needs a decision (a Merkle root
  through the existing distribution tooling, or a new contract) and is not done before the TGE.
- The nonce store is an interface. `MemoryNonceStore` is for tests; a deployed server must use an
  atomic store (one insert wins), for example a unique-key table.
