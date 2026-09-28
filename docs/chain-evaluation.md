# Chain Evaluation

Status: **network decision approved.** Testnet: **Base Sepolia (84532)**, the only
deployable public network. Production: **Base Mainnet (8453)**, hard-locked; no
deployment tooling path permits it (see
[`deployment.md`](deployment.md#network-gate)). Nothing is deployed. Contracts must stay chain-agnostic: no chain IDs, addresses or
chain-specific precompiles in contract code.

## Requirements by protocol layer

| Layer                | What the chain must provide                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ERC-20 token         | Mature EVM; standard ERC-20 support in wallets, explorers and custodians; source verification on the main explorer                                          |
| DEX                  | Existing DEX liquidity and routing; reliable price oracles; block times short enough for swaps without excessive MEV exposure                               |
| AI payments          | Low and predictable fees for frequent small payments; fast finality; account abstraction (ERC-4337) or native equivalent; stablecoin availability           |
| Compute marketplace  | Cheap escrow and settlement transactions; event throughput for job lifecycle updates; reliable indexing                                                     |
| DeFi                 | Oracle coverage (for example Chainlink); established lending and liquidity venues; audited bridges for collateral                                           |
| ZK / privacy         | Cheap on-chain proof verification (BN254 pairing precompiles, EIP-4844 blobs where relevant); support for verifier contracts from the chosen proving system |
| ARL Network (future) | A credible migration or interoperability path: canonical bridge, message passing, or the option to launch a rollup settling to the chosen chain             |

## Evaluation criteria

Each candidate is scored on the same criteria, with sources recorded:

1. **Security** — consensus or rollup security model, proof system status
   (fraud/validity proofs live or not), upgrade keys and exit windows,
   incident history.
2. **Transaction cost** — measured median and p95 fees for an ERC-20 transfer
   and a swap over a recent 30-day window.
3. **Liquidity** — DEX liquidity and stablecoin supply, from public dashboards.
4. **Ecosystem maturity** — wallet, custodian and exchange support; years in
   production.
5. **Developer tooling** — Foundry and Hardhat support, explorer verification
   APIs, testnets and faucets.
6. **RPC and indexing** — number of independent RPC providers, archive node
   availability, The Graph / Ponder / Envio support.
7. **Listing readiness** — support by CoinGecko, CoinMarketCap and major
   exchanges for tokens on that chain.
8. **Interoperability** — bridge options and their security, path to a future
   ARL Network.
9. **Decentralization** — sequencer and validator decentralization, and
   censorship-resistance guarantees.

## Candidates to evaluate

Ethereum mainnet; OP Stack rollups (for example Base, OP Mainnet); Arbitrum
One; ZK rollups (for example zkSync Era, Linea, Scroll); Polygon PoS; BNB Smart
Chain; Avalanche C-Chain.

This list is a starting point, not a shortlist. No metrics are recorded here
until they are measured and sourced.

## Decision gate

The evaluation produces a scored comparison with sources, and a
recommendation. The project lead approves the chain before any deployment
script targets it. Multi-chain deployment is out of scope for the first
release.
