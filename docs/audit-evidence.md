# Security evidence

**No independent audit has been performed.** This document records the free, reproducible
checks that were run, with commands, tool versions and results, so that anyone can repeat them.
It is not an audit report. Scope and intended properties are in [audit-scope.md](audit-scope.md).

Last run: 2026-10-04/05, on commit `9b9952f` plus the changes in this document's commit.

## Contracts checked

| Contract                                        | Deployed on Base Sepolia                                                                                                        | Checked by                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/ARLToken.sol`                              | `0x244312b619127B6458154F3467eFD7c87CD28500`                                                                                    | tests, fuzz, invariants, Slither, manual review |
| `src/ARLAllocation.sol`                         | (library, inlined in the token)                                                                                                 | tests, tokenomics consistency test, Slither     |
| `src/ARLVestingWallet.sol`                      | `0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE` (Investors), `0x02c7692918C98EC710970D390b08f247A76D5A37` (Strategic Partnerships) | tests, fuzz, invariants, Slither, manual review |
| `src/ARLTimelock.sol`                           | `0x5B3fd9E574BC07309949CD39161a295E22FbBd3D`                                                                                    | tests, fuzz, invariants, Slither, manual review |
| `src/ARLMerkleDistributor.sol`                  | not deployed                                                                                                                    | tests, fuzz, invariants, Slither, manual review |
| `src/ARLStakingRewards.sol`                     | not deployed                                                                                                                    | tests, deep invariant campaign, Slither         |
| `src/ARLJobs.sol`, `src/ARLAnonymousSignal.sol` | not deployed                                                                                                                    | tests, Slither                                  |

Dependencies: OpenZeppelin Contracts v5.6.1 (unmodified), forge-std, solidity-datetime v2.2.0
(deployment tooling only).

## Toolchain

| Tool    | Version                          |
| ------- | -------------------------------- |
| solc    | 0.8.36 (optimizer 200, `cancun`) |
| Foundry | forge 1.8.3                      |
| Slither | 0.11.6 (102 detectors)           |
| Node.js | 24.19 (package tests)            |

## Results

| Check                                | Command (in `contracts/` unless noted)                                                                                    | Result                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Unit, fuzz (10,000 runs), invariants | `forge test`                                                                                                              | 247 passed, 0 failed                                  |
| Deep fuzz and invariant campaign     | `FOUNDRY_PROFILE=deep forge test --no-match-path "test/symbolic/*"` (200,000 fuzz runs; 2,000 invariant runs × depth 256) | 247 passed after a test-harness fix (below)           |
| Slither                              | `slither . --foundry-compile-all --filter-paths "lib/\|test/" --exclude-dependencies --fail-low`                          | 115 contracts, 102 detectors, **0 results**           |
| Formatting                           | `forge fmt --check`                                                                                                       | pass                                                  |
| Token ABI                            | `node scripts/check-token-abi.mjs` (repo root)                                                                            | 14 functions, ERC-20 / EIP-2612 only                  |
| Reproducible build                   | `npm run check:bytecode` (repo root)                                                                                      | build reproduces `deploy/bytecode.json` (6 contracts) |
| TypeScript packages                  | `npm run typecheck && npm run lint && npm test` (repo root)                                                               | pass; 208 tests                                       |
| Local deployment rehearsal           | `npm run rehearse:local` (repo root, Git Bash)                                                                            | deployed, verified, 59 negative cases rejected        |
| Base Sepolia fork rehearsal          | `npm run rehearse:base-sepolia-fork` (repo root)                                                                          | pass; nothing sent                                    |
| Base Sepolia deployment              | `VerifyARL`, `bytecode-cli.ts verify`, `supply-cli.ts` against `https://sepolia.base.org`                                 | pass; supply 21,000,000; circulating at TGE 2,100,000 |

### Deep campaign finding (test harness, not contract)

The staking invariant handler kept funding rewards after the distributor's 3,000,000 ARL had been
spent, so the token reverted with `ERC20InsufficientBalance` and `fail_on_revert` reported every
staking invariant. The staking contract behaved correctly. The handler now funds only what the
distributor holds (`test/invariant/ARLStakingInvariant.t.sol`); the deep campaign then passes.

### GitLab CI (Linux), 2026-10-05

Pipeline 2912085364 on `armanalabs-group/arlcoin` (private), commit `cb7837b`: all 9 jobs passed
(TypeScript, contracts, Slither, Halmos, rehearsal with the reproducible-build check, ZK circuit
and verifier, dApp with end-to-end tests, website, Aderyn). Halmos 0.3.3: **11 passed, 0 failed**
(`Symbolic test result: 11 passed; 0 failed`). The ZK job rebuilt the circuit and verifier byte
for byte and passed 18 tests.

### Not reproduced on this machine

Aderyn 0.6.8 publishes no Windows build, and Halmos 0.3.3 needs a native build of `safe-pysha3`
that fails without a C compiler. Both ran in CI before the GitHub account was suspended (Aderyn:
3 reported, all triaged as false positive or style; Halmos: 11 of 11 properties proven; Mythril:
9 reported, none exploitable; see [audit-scope.md](audit-scope.md)). They must be re-run on Linux
before a release.

## Manual review

| Area                     | Observation                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mint and burn            | `_mint` is called only in the token constructor; no mint, burn, owner, pause or upgrade path. `totalSupply == 21,000,000` is checked in the constructor and by invariants.          |
| Access control           | Token: none. Vesting wallets: beneficiary fixed (`transferOwnership`/`renounceOwnership` revert). Timelock: no external admin; only the timelock can change roles, after the delay. |
| Timelock and guardian    | 48-hour floor on construction and on every `updateDelay`; zero-address and guardian-overlap roles rejected; guardian holds only `CANCELLER_ROLE`.                                   |
| Vesting                  | `VestingWallet` with `start = cliffEnd`: nothing before the cliff end, linear after; schedule bounds checked; releases always go to the fixed beneficiary.                          |
| Reentrancy               | Token and vesting use OpenZeppelin ERC-20 without hooks; distributor sets the claimed bit before transferring; staking is `nonReentrant`.                                           |
| Arithmetic and precision | Solidity 0.8 checked math; vesting rounds down (OpenZeppelin); staking reward rate rounds down and the remainder stays unallocated (tested).                                        |
| Initialization           | All contracts are constructor-initialized and immutable; no initializer, no proxy.                                                                                                  |
| Upgradeability           | None.                                                                                                                                                                               |
| Allocation               | Eleven constants sum to 21,000,000 ARL and match `packages/tokenomics` (consistency test); on-chain balances match (manifest).                                                      |
| Deployment addresses     | CREATE addresses equal the simulation and the plan; the deploy screen checks each created address.                                                                                  |

## Findings

| ID  | Severity | Finding                                                                                                                                             | Status                                                                                                                                                                  |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | Medium   | All Safe roles on Base Sepolia are 1-of-1, owned by one EOA. One key controls 18.9M ARL held by the Safes and the timelock's proposer and executor. | Accepted for testnet. Mainnet must use ≥2-of-3 Safes.                                                                                                                   |
| F-2 | Medium   | The deployer/owner EOA has an active EIP-7702 delegation to MetaMask's `EIP7702StatelessDeleGator` (`0x63c0c19a…e32b`), set during Safe creation.   | Open. Clean-up procedure below; must be done before mainnet.                                                                                                            |
| F-3 | Low      | Documentation drift: `ARLTimelock` NatSpec and `audit-scope.md` describe a 3-of-5 treasury Safe and "nothing deployed".                             | `audit-scope.md` updated. The NatSpec is left unchanged so the repository source stays identical to the verified deployed source; fix it with the next contract change. |
| F-4 | Info     | Mythril was not re-run after the GitHub suspension. Halmos and Aderyn were re-run in GitLab CI on 2026-10-05 (Halmos 11/11).                        | Mythril re-run optional.                                                                                                                                                |
| F-5 | Info     | Staking invariant handler over-funded in long campaigns (test code only).                                                                           | Fixed.                                                                                                                                                                  |

No vulnerability was found in the contract code.

## EIP-7702 clean-up (F-2)

The delegation was added by MetaMask's smart-account upgrade in transaction
`0x7ed69117f1b804fdd41fe60d99477a8c5509e76795a2c14f9c94474bbe6c03de` (relayed by
`0xC066ac5D385419B1A8c43A0E146fA439837a8B8c`). The delegate is MetaMask's verified
`EIP7702StatelessDeleGator`. It does not change the Safes, but while it is active the EOA's
behaviour depends on that contract and MetaMask may relay its transactions.

1. In MetaMask: the account menu, **Account details**, **Smart account**, then switch the account
   back to a standard account on Base Sepolia. MetaMask sends one transaction from the EOA that
   authorizes `0x0000000000000000000000000000000000000000` (EIP-7702 delegation reset). It needs a
   little Base Sepolia ETH.
2. Check: `cast code 0x3c3f71d694f709cBe60f015717c54A795636b165 --rpc-url https://sepolia.base.org`
   must print `0x`.
3. For Base Mainnet, deploy from an address that has never been delegated, preferably a hardware
   wallet, and keep MetaMask's smart-account and gas-sponsorship features off for it.

## Explorer verification (Base Sepolia)

Source verified on Sourcify (`forge verify-contract --verifier sourcify`), which Blockscout reads:

| Contract                       | Address                                      | Sourcify | Blockscout | Basescan                  |
| ------------------------------ | -------------------------------------------- | -------- | ---------- | ------------------------- |
| Investors vesting              | `0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE` | verified | verified   | needs `ETHERSCAN_API_KEY` |
| Strategic Partnerships vesting | `0x02c7692918C98EC710970D390b08f247A76D5A37` | verified | verified   | needs `ETHERSCAN_API_KEY` |
| Treasury timelock              | `0x5B3fd9E574BC07309949CD39161a295E22FbBd3D` | match    | verified   | needs `ETHERSCAN_API_KEY` |
| ARL token                      | `0x244312b619127B6458154F3467eFD7c87CD28500` | match    | verified   | needs `ETHERSCAN_API_KEY` |

Constructor arguments were checked against the signed transactions with
`node packages/deploy/src/explorer-cli.ts <plan> <deployment> --check-broadcast <run.json>`.
