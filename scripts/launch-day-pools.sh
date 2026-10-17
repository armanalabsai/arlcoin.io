#!/usr/bin/env bash
# TGE day: builds the two Safe Transaction Builder batches that open the ARL pools on Base Mainnet,
# with the ETH and BTC prices read from Chainlink on Base at this moment. It only reads the chain
# and writes files; nothing is signed or sent.
#
#   apps/dapp/public/plans/8453-pool-liquidity.json      Liquidity Safe, 2,000,000 ARL
#   apps/dapp/public/plans/8453-pool-public-launch.json  Public Launch Safe, 3,000,000 ARL
#
# Both are published at https://arlcoin.io/app/plans/<name>.json once committed. Import the
# Liquidity batch first, then the Public Launch batch (docs/mainnet-runbook.md steps 6 and 7).
# The token and Safe addresses are the planned ones in docs/mainnet-plan.md; after the deployment
# is recorded the script checks that the chain agrees.
# Usage: scripts/launch-day-pools.sh [base-rpc-url]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="${1:-https://mainnet.base.org}"
OUT="$ROOT/apps/dapp/public/plans"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
die() {
  printf '\nLAUNCH POOLS FAILED: %s\n' "$*" >&2
  exit 1
}
planned() { grep -oE "\\| $1 +\\| \`0x[0-9a-fA-F]{40}\`" "$ROOT/docs/mainnet-plan.md" | grep -oE '0x[0-9a-fA-F]{40}'; }

[[ "$(cast chain-id --rpc-url "$RPC")" == "8453" ]] || die "$RPC is not Base Mainnet"
TOKEN="$(planned "ARL token")"
LIQUIDITY="$(planned "Liquidity Safe")"
PUBLIC="$(planned "Public Launch Safe")"
[[ -n "$TOKEN" && -n "$LIQUIDITY" && -n "$PUBLIC" ]] || die "addresses missing from docs/mainnet-plan.md"

# Before the deployment the token has no code; that is fine for preparing the files.
if [[ "$(cast code "$TOKEN" --rpc-url "$RPC")" != "0x" ]]; then
  [[ "$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$LIQUIDITY" --rpc-url "$RPC" | cut -d' ' -f1)" == "2000000000000000000000000" ]] ||
    die "the Liquidity Safe does not hold 2,000,000 ARL"
  [[ "$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$PUBLIC" --rpc-url "$RPC" | cut -d' ' -f1)" == "5000000000000000000000000" ]] ||
    die "the Public Launch Safe does not hold 5,000,000 ARL"
  for Q in 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2 \
    0x4200000000000000000000000000000000000006 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf; do
    POOL="$(cast call 0x33128a8fC17869897dcE68Ed026d694621f6FDfD 'getPool(address,address,uint24)(address)' "$TOKEN" "$Q" 10000 --rpc-url "$RPC")"
    [[ "$POOL" == "0x0000000000000000000000000000000000000000" ]] ||
      echo "note: a 1% pool against $Q already exists ($POOL); the batch reverts unless its price is at or below 0.20 USD"
  done
fi

ETH_USD="$(cast call 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70 'latestAnswer()(int256)' --rpc-url "$RPC" | cut -d' ' -f1)"
BTC_USD="$(cast call 0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F 'latestAnswer()(int256)' --rpc-url "$RPC" | cut -d' ' -f1)"
node "$ROOT/scripts/launch-pools.mjs" "$WORK" "$TOKEN" "$LIQUIDITY" "$PUBLIC" "$ETH_USD" "$BTC_USD"
node "$ROOT/packages/deploy/src/pool-cli.ts" "$WORK/pools.json" "$OUT/8453-pool-liquidity.json" ||
  die "Liquidity batch rejected"
node "$ROOT/packages/deploy/src/pool-cli.ts" "$WORK/pools-public-launch.json" "$OUT/8453-pool-public-launch.json" ||
  die "Public Launch batch rejected"
echo "written: $OUT/8453-pool-liquidity.json and $OUT/8453-pool-public-launch.json (and their .plan.json)"
