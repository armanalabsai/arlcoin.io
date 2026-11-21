# Quickstart: one verified job in one command

Runs a complete verified ERC-8183 job on a local Anvil chain: deploy the token, the jobs escrow and
the verified evaluator; stake three validators; open the job with `@arl/sdk`; let three
unattended validators (the code behind `arl-verifier watch`) accept, re-execute and vote; finalize
after the challenge window; build and verify the job's evidence bundle.

Needs Node.js 24 and Foundry (`anvil`, `forge`).

```sh
npm ci
(cd contracts && forge build)
npm run quickstart -w @arl/verifier
```

Expected output (times from a local run):

```text
   1.4 s  contracts deployed (local chain)
   2.1 s  three validators staked 100 ARL each
   2.6 s  job 1 opened with the SDK, committee approved, funded with 10 ARL
   3.2 s  validators accepted the job (unattended)
   3.4 s  provider submitted deliverable 0xb2ff25af…
   3.9 s  validators re-executed the spec and voted
   4.0 s  challenge window passed; job finalized and provider paid
   4.1 s  evidence bundle verified: 2 approvals, escrow completed
```

By default the job's container is replaced by an in-process runner that writes exactly what the
example spec (`packages/verifier/examples/busybox-summary.json`) writes, so the hashes match a real
run. With Docker installed, `ARL_QUICKSTART_DOCKER=1 npm run quickstart -w @arl/verifier` re-executes
it in the pinned busybox container instead. CI runs the quickstart on every change.

## Pay on proof: a paid HTTP service in one command

The same local chain, with the job opened over HTTP instead of by hand: a service wraps its handler
in `payOnProof`, and a caller pays for one request with `payVerified`
([x402 arl-escrow](../spec/x402-arl-escrow/v0.2.0/README.md)).

```sh
npm run pay-on-proof -w @arl/verifier
```

```text
   0.5 s  contracts deployed (local chain)
   0.8 s  three validators staked 100 ARL each
   1.0 s  caller got 402 with the terms, opened and funded job 1 with 10 ARL, asked again: 200
   1.0 s  service answered {"summary":"passed=3 failed=0"}
   1.0 s  a second request for the same job was refused (409)
   1.2 s  validators accepted the job (unattended)
   1.3 s  service submitted deliverable 0xb2ff25af… on chain
   1.4 s  validators re-executed the spec and voted
   1.5 s  challenge window passed; job finalized and the service paid 10 ARL
```

The service side is one call ([`examples/pay-on-proof.ts`](../packages/verifier/examples/pay-on-proof.ts)):
the wrapper answers `402` with the terms, checks the funded job on chain, approves the committee,
runs the handler once per job and submits the deliverable when the committee has accepted. In a
real service the same handler is a Next.js route, a Hono route or a Cloudflare Worker.

A Python service does the same with `PayOnProof` from `pip install arl-protocol`
([packages/python-sdk](../packages/python-sdk/README.md#pay-on-proof-sell-a-service-and-be-paid-after-it-is-checked)).

Next: on Base Mainnet, sell a service with `payOnProof` or open a job with `openVerifiedJob`
(`arl-protocol-sdk` on npm, [arlcoin.io/build](https://arlcoin.io/build/)), run a validator with
`arl-verifier watch`, and read a job back through the [Agent API](agent-api.md)
([reexecution-spec.md](reexecution-spec.md)).
