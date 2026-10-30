# Base Mainnet plan (deployed 2026-10-24)

Locked 2026-10-05 by owner decision. **Deployed on Base Mainnet on 2026-10-24** at the addresses
below: the 12 Safes from block 53,022,497 and the token at block 53,023,206. `VerifyARL`, the
bytecode check and the supply check passed on chain, and the token, both vesting wallets and the
timelock are source-verified on Basescan.

## Custody

| Role              | Owners                                                               | Threshold |
| ----------------- | -------------------------------------------------------------------- | --------- |
| 11 role Safes     | Owner #1 (Founder), Owner #2, Owner #3                               | 2-of-3    |
| Guardian Safe     | Guardian owner (separate)                                            | 1-of-1    |
| Deployer          | Separate EOA; holds no role and no ARL                               | n/a       |
| Treasury timelock | Proposer/executor Treasury Safe; canceller Guardian Safe; 48 h delay | n/a       |

Signer addresses are operational configuration and stay out of the repository
(`contracts/deploy/deployments/8453-signers.env`, git-ignored, SHA-256
`cac589cc37d0d718bd6285e8bb74e831363a5b4b969bbe903678cc9e1656e31f`; signers replaced by owner on 2026-10-10). Read-only checks on Base
Mainnet (block 52,433,848): all five addresses checksum-valid, distinct, no code (no EIP-7702
delegation), nonce 0, balance 0. The guardian owner is not a role-Safe owner; the deployer is neither.

## Simulation

Run with `scripts/rehearse-base-mainnet-fork.sh` on a local fork of Base Mainnet (chain 8453,
block 52,433,848; re-run 2026-10-10 with the new signers) and the canonical Safe v1.5.0
contracts. Anvil impersonates the real addresses, so no key is used and nothing is sent. Before
the TGE every path is refused (`PlanProductionLocked(8453)`); with the fork clock moved to the TGE:
`CreateSafes`, config and plan (TGE 2026-10-23), `DeployARL`, `VerifyARL`, manifest, supply, the
four Uniswap v3 pools from the Liquidity Safe and the claim distributor (rehearsed only; the
distributor is not deployed at TGE). The addresses below are
the expected mainnet addresses if the deployer starts at nonce 0 and the default salt is used;
on 2026-10-24 every one of them was checked on chain and holds the deployed contract.

Result: all steps pass; total supply 21,000,000 ARL; circulating at TGE 2,100,000 ARL; role Safes
2-of-3; guardian 1-of-1; timelock delay 172,800 s. The deployer, given 0.001 ETH, had 0.000958 ETH left after the Safes,
the contracts and the distributor; fund it with at least 0.001 ETH.

| Contract                       | Address (deployed 2026-10-24)                |
| ------------------------------ | -------------------------------------------- |
| Founder Safe                   | `0x7816Ee6349AeA591B351772eB951A6CF8b223E5c` |
| Investors Safe                 | `0x183A501A6dEb7D575F870a12c36a2266666F8e8a` |
| Strategic Partnerships Safe    | `0x31b8662Bfe4F2c9F9B400D407524356FADc8cC75` |
| Treasury Safe                  | `0x4d9be214f71b391574a3A8dbE145AeF142eB0c13` |
| Guardian Safe                  | `0xB521d1E4eF0dA060e3B6C5d8667DE711abc4D120` |
| Public Launch Safe             | `0x42A0E39399aAd8e088f9561ceC1512EA93D18E05` |
| Community & Staking Safe       | `0xfF12597A671ebAF0cAe37999EE659e03c4f444B5` |
| Ecosystem & Growth Safe        | `0x90D8c082e9AdABE96804Ae9c6117Fd5b245F4cb1` |
| Liquidity Safe                 | `0x8894C0bc9A83Aa497Cf35618b72100dCa459C1AC` |
| Team Safe                      | `0xe5C7F7BDd59286C9baE7FfE85F3CF99382F8989D` |
| Early Users Safe               | `0xdBa5CfeD6E6076DabAbb4a6D851605cC5C8bb47D` |
| Grants & Bug Bounty Safe       | `0xA1B52BA110A2738E5769dE3F9d0BE70E1b0604A3` |
| Investors vesting              | `0x8E2CC3a5F39038836475650f63A91d107BabA643` |
| Strategic Partnerships vesting | `0x36C94925c2BAB7897A000c57CE5536F5Bc60a95B` |
| Treasury timelock              | `0xF3820BC1510a9A1B9aa2b318Dd997127f198B1c2` |
| ARL token                      | `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4` |

The guardian Safe has a new owner, so its mainnet address differs from the Base Sepolia guardian Safe.

Simulated plan SHA-256 (with the placeholder TGE):
`0efdcdfc45352b197425a6902f7ef0bcd1e07fcee2f93c2d22e5a9fe843e01b4`. The real plan is rebuilt with
the approved TGE before the mainnet run. The TGE changes the vesting dates, not the addresses.

## Still required before a mainnet run

1. Done 2026-10-05, updated 2026-10-16: TGE 2026-10-23 and the Public Launch and liquidity
   parameters are approved (both flags set; see [launch-decisions.md](launch-decisions.md)).
2. Not needed at TGE: the Public Launch claim list belongs to the later 500,000 ARL airdrop
   (no airdrop at TGE; date, eligibility and rules announced later).
3. Done 2026-10-05, updated 2026-10-16 (owner approval): `networkGate` opens 8453 at
   2026-10-23T00:00:00Z.
4. The deployer funded with Base ETH; any transaction from it before the run shifts the
   contract addresses above.

## Uniswap v3 pools

Opened 2026-10-24 on Base Mainnet (Uniswap v3, 1% fee tier), from 0.20 USD per ARL. Each pool
holds ARL only at opening; buyers pay in the quote token. Balances read on chain after opening:

| Pool      | Address                                      | ARL at opening |
| --------- | -------------------------------------------- | -------------: |
| ARL/USDC  | `0xBE1c1d2Cd686c3dFEC9221C472A1421B71479b72` |      1,550,000 |
| ARL/USDT  | `0x4A5579fa8aE69c6a1bC1Ad716cfa0fa80c7D5273` |      1,300,000 |
| ARL/WETH  | `0x23C85918509FeBe27f74628FDaC34F064f013A78` |      1,275,000 |
| ARL/cbBTC | `0x644565CF340310Cf24b0D1216D49C40d2A6975db` |        875,000 |
| **Total** |                                              |  **5,000,000** |

2,000,000 ARL came from the Liquidity Safe and 3,000,000 ARL from the Public Launch Safe, which
keeps 2,000,000 ARL. The LP position NFTs are held by those two Safes. The Liquidity Safe batch
needed about 21.3M gas, above Base's per-transaction cap of 16,777,216 (EIP-7825), so it ran as
two Safe transactions (USDC and USDT pools first, then WETH and cbBTC), followed by the Public
Launch batch; the calls and amounts are those of the published plan files.
