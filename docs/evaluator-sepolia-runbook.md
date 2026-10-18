# Verified evaluator: Base Sepolia runbook

Status: **Ready to run; nothing deployed yet.** Run on the machine that holds the wallets. Every
command runs from the repository root unless it says `contracts/`. Base Sepolia only.

Fixed inputs:

| Item              | Value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| RPC               | `https://sepolia.base.org` (chain 84532)                                     |
| Deployer (funded) | `0x3b33Db294B9f52993728103215be1D86A7777093` (or the keystore you sign with) |
| ARL token         | `0x244312b619127B6458154F3467eFD7c87CD28500`                                 |
| ARLJobs (escrow)  | `0xec79a897105aEd6daFBbB2a904E5bcFF71455644`                                 |
| Example spec      | `packages/verifier/examples/busybox-summary.json`                            |
| Example spec hash | `0x06fb69bdc79a7b606079c84133d60ed72922ad8befb01e48d340b512ced8fc0f`         |

```sh
export RPC=https://sepolia.base.org
export ARL=0x244312b619127B6458154F3467eFD7c87CD28500
export JOBS=0xec79a897105aEd6daFBbB2a904E5bcFF71455644
```

## 0. Prepare

```sh
git fetch origin claude/arl-verifiable-execution-layer-kgded1
git checkout claude/arl-verifiable-execution-layer-kgded1
npm ci
foundryup --install v1.8.3          # the version CI pins
(cd contracts && forge build)
cast wallet list                    # the deployer keystore must be here
cast wallet address --account <deployer>
cast balance --ether <deployer address> --rpc-url $RPC
```

Docker must be running for step 7 (the validator re-runs the job in a container).

## 1. Arbiter Safe (2-of-3)

Three addresses from three separate hardware wallets.

```sh
cd contracts
ARL_ARBITER_OWNERS=<hw1>,<hw2>,<hw3> ARL_ARBITER_THRESHOLD=2 \
  forge script script/CreateArbiterSafe.s.sol:CreateArbiterSafe \
  --rpc-url $RPC --broadcast --account <deployer> --slow
export SAFE=<the returned safe address>
cast call $SAFE "getThreshold()(uint256)" --rpc-url $RPC   # 2
cast call $SAFE "getOwners()(address[])" --rpc-url $RPC    # the three addresses
```

Open the Safe in the Safe web app (Base Sepolia) with each hardware wallet once, to confirm every
signer can sign.

## 2. Evaluator

```sh
ARL_JOBS=$JOBS ARL_ARBITER=$SAFE \
  forge script script/DeploySepoliaEvaluator.s.sol:DeploySepoliaEvaluator \
  --rpc-url $RPC --broadcast --account <deployer> --slow
export EV=<the returned evaluator address>
cast call $EV "arbiter()(address)" --rpc-url $RPC              # $SAFE
cast call $EV "stakeToken()(address)" --rpc-url $RPC           # $ARL
cast call $EV "minChallengeWindow()(uint64)" --rpc-url $RPC    # 3600
cast call $EV "minBond()(uint96)" --rpc-url $RPC               # 1e18
```

Defaults: minimum challenge window 1 hour, bond floor 1 ARL (`ARL_MIN_CHALLENGE_WINDOW`,
`ARL_MIN_BOND` override them).

## 3. Source verification

```sh
ARGS=$(cast abi-encode "constructor(address,address,uint64,uint96,address,address)" \
  $JOBS $SAFE 3600 1000000000000000000 \
  0x8004A818BFB912233c491871b3d84c89A494BD9e 0x8004B663056A597Dffe9eCcC1965A193B7388713)
forge verify-contract $EV src/ARLVerifiedEvaluator.sol:ARLVerifiedEvaluator --chain 84532 \
  --verifier blockscout --verifier-url https://base-sepolia.blockscout.com/api/ \
  --constructor-args $ARGS --watch
cd ..
```

## 4. Test accounts

Five keystores: client, provider, v1, v2, v3 (`cast wallet new`, then
`cast wallet import <name> --private-key …`). From the deployer, send each 0.0001 ETH:

```sh
cast send <address> --value 0.0001ether --rpc-url $RPC --account <deployer>
```

Each claims 1,000 testnet ARL from the app faucet at https://arlcoin.io/app (once per 24 hours).

## 5. Validators stake

For v1, v2, v3:

```sh
cast send $ARL "approve(address,uint256)" $EV 100ether --rpc-url $RPC --account v1
cast send $EV "stake(uint256)" 100ether --rpc-url $RPC --account v1
cast call $EV "stakeOf(address)(uint256)" <v1 address> --rpc-url $RPC
```

## 6. Open the example job (client, then provider)

The job description is the spec's URI; the evaluator stores its hash.

```sh
SPEC_URI=https://raw.githubusercontent.com/armanalabsai/arlcoin.io/claude/arl-verifiable-execution-layer-kgded1/packages/verifier/examples/busybox-summary.json
SPEC_HASH=0x06fb69bdc79a7b606079c84133d60ed72922ad8befb01e48d340b512ced8fc0f
EXPIRY=$(( $(date +%s) + 86400 ))

cast send $JOBS "createJob(address,address,uint256,string,address)" \
  <provider> $EV $EXPIRY "$SPEC_URI" 0x0000000000000000000000000000000000000000 \
  --rpc-url $RPC --account client
export JOB=$(cast call $JOBS "jobCounter()(uint256)" --rpc-url $RPC)

# Reexecution, 2-of-3, vote window 1 h, challenge window 1 h, bond floor 1 ARL, no ERC-8004 agent.
cast send $EV "configure(uint256,(uint8,uint8,uint64,uint64,uint96,uint256,bytes32,address[]))" \
  $JOB "(1,2,3600,3600,1000000000000000000,0,$SPEC_HASH,[<v1>,<v2>,<v3>])" \
  --rpc-url $RPC --account client

cast send $EV "approveCommittee(uint256)" $JOB --rpc-url $RPC --account provider
cast send $JOBS "setBudget(uint256,uint256,bytes)" $JOB 10ether 0x --rpc-url $RPC --account provider

cast send $ARL "approve(address,uint256)" $JOBS 10ether --rpc-url $RPC --account client
cast send $JOBS "fund(uint256,uint256,bytes)" $JOB 10ether 0x --rpc-url $RPC --account client
```

Each validator accepts (locks max(1 ARL, 10 ARL / 10) = 1 ARL):

```sh
cast send $EV "accept(uint256)" $JOB --rpc-url $RPC --account v1   # and v2, v3
```

## 7. Run, submit, vote

Provider runs the job and submits the result hash:

```sh
DELIVERABLE=$(node packages/verifier/src/cli.ts run packages/verifier/examples/busybox-summary.json \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).deliverable))')
cast send $JOBS "submit(uint256,bytes32,bytes)" $JOB $DELIVERABLE 0x --rpc-url $RPC --account provider
cast send $EV "startVoting(uint256)" $JOB --rpc-url $RPC --account provider
```

Each validator re-runs and votes (the key is read from the environment, never from arguments):

```sh
ARL_VALIDATOR_KEY=$(cast wallet private-key --account v1) \
  node packages/verifier/src/cli.ts vote $RPC $EV $JOB packages/verifier/examples/busybox-summary.json
# then v2
cast call $EV "getVerdict(uint256)" $JOB --rpc-url $RPC   # phase 2 = Approved
```

## 8. Finalize (after the 1-hour challenge window)

```sh
cast send $EV "finalize(uint256)" $JOB --rpc-url $RPC --account client
cast call $JOBS "getJob(uint256)" $JOB --rpc-url $RPC     # status 3 = Completed
cast call $ARL "balanceOf(address)(uint256)" <provider> --rpc-url $RPC
```

Optional dispute rehearsal on a second job: dispute within the window
(`dispute(uint256,bytes32)`, after approving 1 ARL to the evaluator), then propose
`resolve(uint256,bool,bytes32)` from the Safe web app and sign with two hardware wallets.

## 9. Record

Add the Safe and the evaluator, with deploy blocks, to `contracts/deploy/base-sepolia.json`, the
README contract table and `docs/verification-evidence.md`; list the example job's transaction
hashes in `docs/verifiable-execution.md`. Then open the pull request.
