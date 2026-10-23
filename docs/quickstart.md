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

Next: open real jobs on Base Sepolia with `openVerifiedJob` (`packages/sdk/src/verified.ts`), run a
validator with `arl-verifier watch`, and export a job's evidence with `arl-verifier bundle`
([reexecution-spec.md](reexecution-spec.md)).
