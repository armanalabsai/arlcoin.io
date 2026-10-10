#!/usr/bin/env bash
# Rehearses the Base Sepolia ecosystem deployment on a LOCAL fork of Base Sepolia (nothing is
# sent to Base Sepolia). Anvil impersonates the testnet operator and the testnet Safes, so no key
# is used.
#
#   1. DeploySepoliaEcosystem: ARLStakingRewards and ARLJobs against the deployed testnet ARL
#   2. DeploySepoliaSignal: the anonymous-signal verifier and contract
#   3. The Safe batches in apps/dapp/public/plans/84532-ecosystem-safe-*.json, executed as the
#      Safes would: the Community & Staking Safe funds 30,000 ARL of staking rewards, the
#      Ecosystem & Growth Safe funds the testnet operator
#   4. Checks: no owner or admin on the new contracts, the reward period runs, the operator holds
#      testnet ARL
#
# Usage: scripts/rehearse-sepolia-ecosystem.sh [fork-rpc-url]
# ARL_USE_FORK=<rpc> uses a fork that is already running (and leaves it running); ARL_OPERATOR
# replaces the testnet operator; ARL_FORK_OUT changes the output directory under contracts/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORK_URL="${1:-https://sepolia.base.org}"
PORT="${ARL_FORK_PORT:-18760}"
RPC="http://127.0.0.1:$PORT"
OUT="${ARL_FORK_OUT:-deploy/deployments/fork-84532}"
OPERATOR="${ARL_OPERATOR:-0x3b33Db294B9f52993728103215be1D86A7777093}"
TOKEN=0x244312b619127B6458154F3467eFD7c87CD28500
COMMUNITY_SAFE=0x6e7bD80144ea10e5E1FcF95Fc4B044415CFE61d4

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\nSEPOLIA ECOSYSTEM REHEARSAL FAILED: %s\n' "$*" >&2
  exit 1
}
cleanup() { if [[ -n "${ANVIL_PID:-}" ]]; then kill "$ANVIL_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

if [[ -n "${ARL_USE_FORK:-}" ]]; then
  RPC="$ARL_USE_FORK"
  [[ "$(cast chain-id --rpc-url "$RPC")" == "84532" ]] || die "$RPC is not a Base Sepolia fork"
  [[ "$(cast rpc anvil_nodeInfo --rpc-url "$RPC" 2>/dev/null)" != "" ]] || die "$RPC is not an Anvil fork"
else
  [[ "$(cast chain-id --rpc-url "$FORK_URL")" == "84532" ]] || die "$FORK_URL is not Base Sepolia"
  if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then die "port $PORT is in use"; fi
  log "Forking Base Sepolia locally on port $PORT"
  anvil --port "$PORT" --fork-url "$FORK_URL" --auto-impersonate --silent &
  ANVIL_PID=$!
  for _ in $(seq 1 150); do
    if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
    sleep 0.2
  done
  [[ "$(cast chain-id --rpc-url "$RPC")" == "84532" ]] || die "fork did not start as chain 84532"
fi
cast rpc anvil_setBalance "$OPERATOR" "$(cast to-hex 300000000000000)" --rpc-url "$RPC" >/dev/null

cd "$ROOT/contracts"
rm -rf "$OUT"
mkdir -p "$OUT"

log "1. DeploySepoliaEcosystem (staking, jobs)"
ARL_TOKEN="$TOKEN" ARL_REWARDS_DISTRIBUTION="$COMMUNITY_SAFE" ARL_ECOSYSTEM_OUT="$OUT/ecosystem.json" \
  forge script script/DeploySepoliaEcosystem.s.sol:DeploySepoliaEcosystem \
  --rpc-url "$RPC" --broadcast --unlocked --sender "$OPERATOR" --slow >"$OUT/ecosystem.log" 2>&1 ||
  die "DeploySepoliaEcosystem failed (see contracts/$OUT/ecosystem.log)"
log "2. DeploySepoliaSignal (verifier, anonymous signals)"
ARL_SIGNAL_OUT="$OUT/signal.json" FOUNDRY_PROFILE=zk \
  forge script zk-script/DeploySepoliaSignal.s.sol:DeploySepoliaSignal \
  --rpc-url "$RPC" --broadcast --unlocked --sender "$OPERATOR" --slow >"$OUT/signal.log" 2>&1 ||
  die "DeploySepoliaSignal failed (see contracts/$OUT/signal.log)"
cat "$OUT/ecosystem.json" "$OUT/signal.json"
echo
echo "operator ETH spent: $(cast from-wei $((300000000000000 - $(cast balance "$OPERATOR" --rpc-url "$RPC"))))"

STAKING="$(node -e "console.log(require('./$OUT/ecosystem.json').staking)")"
JOBS="$(node -e "console.log(require('./$OUT/ecosystem.json').jobs)")"
SIGNAL="$(node -e "console.log(require('./$OUT/signal.json').signal)")"

log "3. Safe batches"
node "$ROOT/packages/deploy/src/sepolia-ecosystem-cli.ts" "$OUT/ecosystem.json" "$OPERATOR" \
  "$OUT/safe" || die "Safe batches rejected"
for f in "$OUT"/safe-*.json; do
  SAFE="$(node -e "console.log(require('./$f').meta.createdFromSafeAddress)")"
  cast rpc anvil_setBalance "$SAFE" "$(cast to-hex 100000000000000000)" --rpc-url "$RPC" >/dev/null
  node -e "for (const t of require('./$f').transactions) console.log(t.to, t.data)" |
    while read -r TO DATA; do
      cast send "$TO" "$DATA" --from "$SAFE" --unlocked --rpc-url "$RPC" >/dev/null ||
        die "$(basename "$f"): call to $TO failed"
    done
  echo "executed $(basename "$f") as $SAFE"
done

log "4. Checks"
[[ "$(cast call "$STAKING" 'rewardsDistribution()(address)' --rpc-url "$RPC")" == "$COMMUNITY_SAFE" ]] ||
  die "staking reward distributor is not the Community & Staking Safe"
[[ "$(cast call "$STAKING" 'stakingToken()(address)' --rpc-url "$RPC")" == "$TOKEN" ]] || die "staking token"
[[ "$(cast call "$JOBS" 'paymentToken()(address)' --rpc-url "$RPC")" == "$TOKEN" ]] || die "jobs token"
FINISH="$(cast call "$STAKING" 'periodFinish()(uint256)' --rpc-url "$RPC" | cut -d' ' -f1)"
NOW="$(cast block latest --field timestamp --rpc-url "$RPC")"
((FINISH > NOW)) || die "the reward period is not running"
REWARDS="$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$STAKING" --rpc-url "$RPC" | cut -d' ' -f1)"
[[ "$REWARDS" == "30000000000000000000000" ]] || die "staking holds $REWARDS, not 30,000 ARL"
OPERATOR_ARL="$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$OPERATOR" --rpc-url "$RPC" | cut -d' ' -f1)"
[[ "$OPERATOR_ARL" == "200000000000000000000000" ]] || die "operator holds $OPERATOR_ARL, not 200,000 ARL"
[[ "$(cast call "$SIGNAL" 'groupCount()(uint256)' --rpc-url "$RPC")" == "0" ]] || die "signal groups"
echo "staking $STAKING: 30,000 ARL over 30 days, ends $FINISH"
echo "jobs $JOBS, anonymous signals $SIGNAL"
echo "operator holds 200,000 testnet ARL for the faucet and the demo services"

log "SEPOLIA ECOSYSTEM REHEARSAL PASSED; nothing was sent to Base Sepolia"
