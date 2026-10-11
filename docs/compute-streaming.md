# Compute streaming: per-second payments in ARL

Status: **IN DEVELOPMENT.** Tested on a local chain (Foundry unit, fuzz and invariant tests, and
an Anvil end-to-end test of the SDK). Not deployed; not externally audited.

A client pays a compute provider by the second. The client opens a stream at a fixed rate for at
most a fixed duration and escrows `rate × duration` ARL. The provider earns the rate every second
until the stream is stopped or the duration runs out; whatever was not earned goes back to the
client.

## How it works

| Step     | Who                                                 | What happens                                                              |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Open     | Client                                              | `streamCompute(provider, ratePerSecond, maxDuration)` escrows the deposit |
| Accrue   | (time)                                              | The provider earns `ratePerSecond` per second, until the end time         |
| Withdraw | Provider                                            | Takes what it has earned so far, at any time                              |
| Stop     | Client or provider (any time); anyone after the end | Settles: the provider gets what it earned, the client gets the rest back  |

Accrual stops by itself at the end time (the timeout), so a stream never pays more than its
deposit. Settlement only ever pays the two parties of the stream, which is why anyone may trigger
it after the end time: escrow can never be locked by an absent party.

## Contract

`contracts/src/ComputePayment.sol` (Apache-2.0) is a simplified linear stream after Sablier V2
`SablierV2LockupLinear` (sablier-labs/v2-core): no cliff, no NFT, no broker fee. Design choices:

- One payment token fixed at deployment (ARL). No owner, no admin, no pause, no upgrade, no fee.
- OpenZeppelin `SafeERC20` and `ReentrancyGuardTransient` on every function that moves tokens;
  state is written before any transfer (checks-effects-interactions).
- The deposit must fit in `uint128` and the duration is at most 365 days, so the stream's
  bookkeeping (`withdrawn`, rate) fits three storage slots without truncation.
- The contract checks that it received exactly the deposit; a token that charges a transfer fee
  is refused (`UnexpectedDeposit`).

Events: `StreamStarted`, `Withdrawn`, `StreamStopped`, `PaymentSettled`.

Tests: `contracts/test/ComputePayment.t.sol` (normal flow, reentrancy through a hostile callback
token, insufficient balance and allowance, timeout, early stop and refund, input validation,
fee-on-transfer refusal, fuzzed settlement) and `contracts/test/invariant/ComputePaymentInvariant.t.sol`
(escrow balance equals live deposits minus withdrawals; no stream pays more than its deposit;
every token is escrowed, paid or refunded; supply conserved). Line, statement, branch and
function coverage of the contract is 100%.

## SDK

`packages/sdk` (`@arl/sdk`, viem):

```ts
import { streamComputePayment, stopComputeStream } from "@arl/sdk";

const stream = await streamComputePayment(
  { publicClient, walletClient },
  {
    chain: baseSepolia,
    contractAddress,
    providerAddress,
    tokenAddress,
    ratePerSecond: parseUnits("0.01", 18),
    maxDurationSeconds: 3600,
    maxCap: parseUnits("36", 18),
  },
);
await stopComputeStream(
  { publicClient, walletClient },
  { chain: baseSepolia, contractAddress, streamId: stream.streamId },
);
```

Before anything is signed, `streamComputePayment` checks the parameters (`maxCap` is the most the
client accepts to escrow), refuses Base Mainnet, checks that both clients are on the expected
chain, that the contract streams the given token and that the balance covers the deposit. It
approves exactly the deposit (never an unlimited allowance) and simulates every transaction
first, so a contract revert is reported as a `StreamingError` with the custom error name.

Tests: `npm test -w @arl/sdk` (offline) and `npm run test:anvil -w @arl/sdk` (needs Foundry and
`forge build` in `contracts/`; deploys ARLToken and ComputePayment on Anvil, runs the SDK end to
end and fails if the SDK's ABI differs from the compiled contract).

## Deployment

`contracts/script/DeployComputePayment.s.sol` deploys ComputePayment against an ARL token that is
already deployed. It runs on local Anvil (31337) and Base Sepolia (84532) only and refuses Base
Mainnet and every other chain. Before deploying it requires the token to be ARL (code at the
address, symbol `ARL`, 18 decimals, total supply exactly 21,000,000); after deploying it checks the
contract's `paymentToken` and empty state. It writes no record: after the broadcast,
`node packages/deploy/src/record-cli.ts compute-payment
broadcast/DeployComputePayment.s.sol/84532/run-latest.json https://sepolia.base.org
deploy/deployments/84532-compute-payment.json` checks the receipt, the code at the address
(ComputePayment build) and `paymentToken()`, and only then writes the record
([deployment.md](deployment.md#deployment-records)). The contract has no
owner, so the deployer keeps no role. Its creation and runtime hashes are in
`contracts/deploy/bytecode.json` (`npm run check:bytecode`).

Local rehearsal (no key; Anvil development accounts):

```sh
anvil &
cd contracts
forge script script/DevDapp.s.sol:DevDapp --rpc-url http://127.0.0.1:8545 --broadcast \
  --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ARL_TOKEN=<token from deploy/deployments/31337-dapp.json> \
  forge script script/DeployComputePayment.s.sol:DeployComputePayment \
  --rpc-url http://127.0.0.1:8545 --broadcast --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Base Sepolia. ARL is deployed there at `0x244312b619127B6458154F3467eFD7c87CD28500` (see
[deployment.md](deployment.md#base-sepolia-deployment)). Simulate first (no `--broadcast`, no key),
then broadcast with the deployer's own keystore, then write the verified record (above):

```sh
ARL_TOKEN=0x244312b619127B6458154F3467eFD7c87CD28500 \
  forge script script/DeployComputePayment.s.sol:DeployComputePayment \
  --rpc-url https://sepolia.base.org --sender <deployer>
ARL_TOKEN=0x244312b619127B6458154F3467eFD7c87CD28500 \
  forge script script/DeployComputePayment.s.sol:DeployComputePayment \
  --rpc-url https://sepolia.base.org --broadcast --account <keystore> --sender <deployer>
```

Prerequisites: a deployer keystore funded with Base Sepolia ETH (faucet; the simulation estimates
about 0.000014 ETH); optionally a Basescan API key in `ETHERSCAN_API_KEY` for `--verify`
(Blockscout verification needs no key). The phone **Deploy** screen accepts only the ARL system's
own creations, so ComputePayment is broadcast from the command line.

## Limits

- ComputePayment is not deployed on any public network. ARL is deployed on Base Sepolia;
  ComputePayment is deployed after it. Base Mainnet is refused by the deploy script and by the
  SDK.
- A stream pushes the provider's share to the provider at settlement. With ARL (a plain ERC-20,
  no hooks) that transfer cannot be blocked by the recipient.
- Not in the scope of the first audit (see [audit-scope.md](audit-scope.md)).
