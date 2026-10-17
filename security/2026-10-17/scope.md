# Scope

Security review of 2026-10-17. Reviewed commit:
`ab7595bc39c9256641fffc70103575c03a1cce9d` (`main`, after PR #54).

## Contracts

| File                                     | SHA-256                                                            | On Base Mainnet at TGE |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `contracts/src/ARLToken.sol`             | `374a7cd0ffcca6eac87996d7a6328a2d5fce4bb16661b1eb06f02b15fa8893c8` | yes                    |
| `contracts/src/ARLAllocation.sol`        | `49c25087b7e87a3d2693f2d54202b6bcbce41d468c84faaa61f696d0e768fdb2` | yes (library)          |
| `contracts/src/ARLVestingWallet.sol`     | `a5b291daf1366233eb10cc05d6fc624d1d1c7e8ac26919fa7e704e8978a93e2d` | yes (2 wallets)        |
| `contracts/src/ARLTimelock.sol`          | `7aed212888c032f553e9d33eb2fb7f122d790492eb1fc5bccb5f54617ed855f5` | yes                    |
| `contracts/src/ARLStakingRewards.sol`    | `2bfcb880b0848abc039a61684be0cad870b56b45d4b10005fdbefe3a111027d3` | no (Base Sepolia)      |
| `contracts/src/ARLMerkleDistributor.sol` | `7aa8d3959986ee840dc3536fea355970cbe6589638b887213d258c52c44a1762` | no (later airdrop)     |
| `contracts/src/ComputePayment.sol`       | `774a225e24fbaa6b6622ba7418cb62777a8274aed308372299e5694f9b066d24` | no                     |
| `contracts/src/ARLJobs.sol`              | `a455e849e6d1b3a4ee05549da6033d622ffd879cf3b9d943b45ba7f6f21f22fd` | no                     |
| `contracts/src/ARLAnonymousSignal.sol`   | `a093a361e07d882db1f7db596e750a0a79caf4fdeadce531cfe870a1c24d45bd` | no                     |
| `contracts/zk/ARLSemaphoreVerifier.sol`  | `7336b1359bc1d49251a143373a96c97861c697bc1f9924459c97b3187ca64935` | no (generated)         |

Also reviewed: the deployment scripts (`contracts/script/DeployARL.s.sol`, `ARLDeployer.sol`,
`ARLDeployPlan.sol`, `ARLVerify.sol`), the signed Base Mainnet run
`apps/dapp/public/plans/8453-deploy.json` (SHA-256
`4e7acae253947d3343daeed8a56b893459d1b7797c2e7045bb2204ebfd6d909a`), the deploy screen's run
parser (`apps/dapp/lib/deploySteps.ts`) and the Uniswap v3 batch builder
(`packages/deploy/src/pool.ts`).

## Build

solc 0.8.36, optimizer 200 runs, EVM cancun, no via-IR. OpenZeppelin Contracts v5.6.1 at
`5fd1781b1454fd1ef8e722282f86f9293cacf256`, unmodified. Foundry 1.8.3.

## Deployment run check

The creation code of all four transactions in `8453-deploy.json` equals the bytecode built from
the reviewed commit, and their constructor arguments equal `docs/mainnet-plan.md`:

- **Vesting wallets (nonces 12, 13).** Beneficiaries: Investors Safe and Strategic Partnerships Safe. Cliff start 1792713600 (2026-10-23), cliff end 1824249600 (2027-10-23), vesting end 1918944000 (2030-10-23).
- **Timelock (nonce 14).** Delay 172800 s. Proposer and executor: the Treasury Safe only. Guardian: `0xB521d1E4eF0dA060e3B6C5d8667DE711abc4D120`.
- **Token (nonce 15).** The eleven recipients in canonical order, with the two vesting wallets and the timelock in their slots.

## Out of scope

- Safe v1.5.0, OpenZeppelin and Uniswap v3 internals (used unmodified).
- The Noir circuit and the Barretenberg verifier generator.
- Off-chain components: website, dApp hosting, Telegram bot, x402 facilitator, DNS.
- Market and tokenomics analysis, and legal questions.
- Full formal verification. The Halmos checks are bounded.
