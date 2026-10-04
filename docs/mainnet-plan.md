# Base Mainnet plan (LOCKED, not deployed)

Locked 2026-10-05 by owner decision. **Nothing is deployed, created or funded on Base Mainnet.**
The network gate still refuses chain 8453.

## Custody

| Role              | Owners                                                               | Threshold |
| ----------------- | -------------------------------------------------------------------- | --------- |
| 11 role Safes     | Owner #1 (Founder), Owner #2, Owner #3                               | 2-of-3    |
| Guardian Safe     | Guardian owner (separate)                                            | 1-of-1    |
| Deployer          | Separate EOA; holds no role and no ARL                               | n/a       |
| Treasury timelock | Proposer/executor Treasury Safe; canceller Guardian Safe; 48 h delay | n/a       |

Signer addresses are operational configuration and stay out of the repository
(`contracts/deploy/deployments/8453-signers.env`, git-ignored, SHA-256
`1a3fe635c32e9be733f7b4a495e9b514be77d19a7a599057d408b1979c8712f8`). Read-only checks on Base
Mainnet (block 52,183,747): all five addresses checksum-valid, distinct, no code (no EIP-7702
delegation), nonce 0. The guardian owner is not a role-Safe owner; the deployer is neither.

## Simulation

Run on a local fork of Base Mainnet (block 52,183,747) with the canonical Safe v1.5.0 contracts:
`CreateSafes`, config and plan (TGE placeholder 2026-12-01), `DeployARL`, `VerifyARL`, manifest and
supply. The fork ran with chain id 84532 because the network gate refuses 8453 by design;
CREATE and CREATE2 addresses do not depend on the chain id, so they are the expected mainnet
addresses if the deployer starts at nonce 0 and the default salt is used.

Result: all steps pass; total supply 21,000,000 ARL; circulating at TGE 2,100,000 ARL; role Safes
2-of-3; guardian 1-of-1; timelock delay 172,800 s. Gas used 7,554,078 (about 0.00005 ETH at
0.006 gwei; fund the deployer with at least 0.001 ETH).

| Contract                       | Expected address                             |
| ------------------------------ | -------------------------------------------- |
| Founder Safe                   | `0x54E1dcA7fce1CB3d9A22cE021BA83a65CEFB1BAC` |
| Investors Safe                 | `0xF7b5c707b394a6F654BCf1Fa01Be5499e6F35A46` |
| Strategic Partnerships Safe    | `0x9fBA4cba76e018a30a8716CCCF02D08A34ee172f` |
| Treasury Safe                  | `0xf3DeA34A781002D30E24c1480d44fF811D5C0dca` |
| Guardian Safe                  | `0xdF97b71F45dcbD3a713EF8eD8e106F0e19E95BcD` |
| Public Launch Safe             | `0xb9829b9145581042776fa65bbF56972447aCdB38` |
| Community & Staking Safe       | `0x5Cfe39d281D008eF359c979f2DB9096739044738` |
| Ecosystem & Growth Safe        | `0x7D3e1037c2F99BDfb7D3d4c5a3Ec158198eBEdBC` |
| Liquidity Safe                 | `0x220D3a21366FD386CEEEF4ba36c7aE6582AB3C18` |
| Team Safe                      | `0x5c6cBdFa6747F1D0974e84F27AAD52263cA3A1bf` |
| Early Users Safe               | `0xbCb6A2860E0390eD3aeAde46cc7d248be0Ff9b5A` |
| Grants & Bug Bounty Safe       | `0x85D6f4702Cd88486A0AE644FF6A8825253dB7B9B` |
| Investors vesting              | `0xa56d7c78F0ca7795c2A6789DBb485A3Faa6453fD` |
| Strategic Partnerships vesting | `0x8297f965ECD2B9279Dd3FeCa9ef1a0B1dD7b2736` |
| Treasury timelock              | `0xB2A6565325B7f1886376f5F5FAC9c617c4854111` |
| ARL token                      | `0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97` |

The guardian Safe has the same address as on Base Sepolia (same owner, salt and factory).

Simulated plan SHA-256 (with the placeholder TGE):
`2b3eaa4c15e5b2aa79147d7741214a1ab0b396ac0f7b1e96ed8137c97855f022`. The real plan is rebuilt with
the approved TGE before the mainnet run. The TGE changes the vesting dates, not the addresses.

## Still required before a mainnet run

1. TGE approval (`VESTING_SCHEDULES_APPROVED = false`).
2. Public Launch claim parameters (`LAUNCH_PARAMETERS_APPROVED = false`) and liquidity plan.
3. A reviewed change to `networkGate` that opens 8453.
4. The deployer funded with Base ETH; any transaction from it before the run shifts the
   contract addresses above.
