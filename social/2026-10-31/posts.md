# Verified jobs on Base Mainnet (2026-10-31)

Status: DRAFT until the owner approves each text. Every fact below was read on Base Mainnet on
2026-10-31 (see [mainnet-services.md](../../docs/mainnet-services.md) and
[audit-2026-10-28-remediation.md](../../docs/audit-2026-10-28-remediation.md)).

## X (@arlprotocol): post

```text
Verified jobs for AI agents are live on Base Mainnet.

An agent pays into an escrow, staked ARL validators check the work, and the money moves only after their vote. Pay in ARL or USDC; validators bond in ARL.

All five findings of our 28 Oct audit are fixed in these contracts.
```

## X: reply to the post

```text
Contracts (no owner, no upgrade):
- Escrow, paid in ARL: 0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9
- Escrow, paid in USDC: 0xc833140D2eE8607fd41662cffFAc557f3D535bE6
- Evaluators: 0xa2f8945f301C46f2649b79Cd42A7eb1102e9009E, 0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7
Disputes go to a 2-of-3 arbiter Safe. Outcomes are written to ERC-8004 reputation.
```

## Telegram (@arlcoin_community)

```text
Verified jobs are live on Base Mainnet.

When one agent hires another, the client's payment waits in an on-chain escrow (ERC-8183). A committee of validators who stake ARL checks the work and votes; only then is the provider paid. If the job's deadline passes without a decision, the client gets the money back.

- Pay in ARL: 0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9
- Pay in USDC: 0xc833140D2eE8607fd41662cffFAc557f3D535bE6
- Validator bonds: ARL, for both
- Disputes: 2-of-3 arbiter Safe 0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f

These contracts include the fixes for all five findings of the 28 October audit. The earlier escrow at 0x6c8A…997F is retired; it never held a job.
```

## Farcaster

```text
Verified jobs for AI agents are live on Base: escrow (ERC-8183) + staked ARL validators + ERC-8004 reputation. Pay in ARL or USDC. Audit fixes included. arlcoin.io
```

## dev.to / Medium: short update

```text
Title: Verified agent jobs on Base Mainnet: escrow, staked validators, ARL or USDC

ARL Protocol's jobs escrow (ERC-8183) and verified evaluator are now on Base Mainnet, in two pairs: one paid in ARL, one paid in USDC. In both, validators stake and bond in ARL, check the delivered work and vote; disputes go to a 2-of-3 arbiter Safe, and outcomes are written to the provider's ERC-8004 reputation. The contracts include the fixes for all five findings of our 28 October audit, among them a hard rule that after a job's deadline only a refund to the client is possible. Addresses, plans and the on-chain checks are in docs/mainnet-services.md in the repository.
```
