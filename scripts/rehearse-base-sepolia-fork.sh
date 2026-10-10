#!/usr/bin/env bash
# Dry run of the Base Sepolia deployment on a LOCAL fork of Base Sepolia.
#
# Anvil forks Base Sepolia (chain 84532) at the latest block and runs on this machine. Every
# transaction goes to the local fork only; nothing is sent to Base Sepolia. The fork has the
# canonical Safe v1.5.0 contracts, so this exercises exactly the path a real testnet deployment
# takes: CreateSafes (canonical factory, SafeL2 and fallback handler, code-hash checked), the
# verified-record tool (canonical factory, singleton and proxy code hashes, owners, thresholds),
# the config builder, the planner, DeployARL (network gate, code checks, canonical-singleton Safe
# proxies), VerifyARL and the manifest. The records it writes are stamped
# `base-sepolia-fork-rehearsal`: they are evidence of the tooling, not of anything on Base Sepolia.
#
# Owners are Anvil development accounts; no private key is used. Needs outbound HTTPS to the RPC.
# Not part of CI.
#
# Usage: scripts/rehearse-base-sepolia-fork.sh [fork-rpc-url]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORK_URL="${1:-https://sepolia.base.org}"
PORT="${ARL_FORK_PORT:-18645}"
RPC="http://127.0.0.1:$PORT"
OUT="deploy/deployments/fork-84532"

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\nFORK REHEARSAL FAILED: %s\n' "$*" >&2
  exit 1
}
cleanup() { if [[ -n "${ANVIL_PID:-}" ]]; then kill "$ANVIL_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

[[ "$(cast chain-id --rpc-url "$FORK_URL")" == "84532" ]] || die "$FORK_URL is not Base Sepolia"
if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then die "port $PORT is in use"; fi

log "Forking Base Sepolia locally on port $PORT"
anvil --port "$PORT" --fork-url "$FORK_URL" --silent &
ANVIL_PID=$!
for _ in $(seq 1 100); do
  if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
[[ "$(cast chain-id --rpc-url "$RPC")" == "84532" ]] || die "fork did not start as chain 84532"

ACCOUNTS="$(cast rpc eth_accounts --rpc-url "$RPC" | tr -d '[]" ')"
account() { cut -d, -f"$(($1 + 1))" <<<"$ACCOUNTS"; }
DEPLOYER="$(account 0)"

cd "$ROOT/contracts"
rm -rf "$OUT"
mkdir -p "$OUT"

log "CreateSafes with the canonical Safe v1.5.0 contracts"
ARL_SAFE_OWNERS="$(account 2),$(account 3),$(account 4)" ARL_SAFE_THRESHOLD=2 \
  ARL_GUARDIAN_OWNERS="$(account 6),$(account 7)" ARL_GUARDIAN_THRESHOLD=2 \
  ARL_SALT="fork-$(date +%s)" \
  forge script script/CreateSafes.s.sol:CreateSafes \
  --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER" --slow >/dev/null ||
  die "CreateSafes failed"
# The record comes only from the verified-record tool, as on Base Sepolia. On a fork it must be
# run with --local-anvil and is stamped base-sepolia-fork-rehearsal: never a Base Sepolia record.
RECORD="$ROOT/packages/deploy/src/record-cli.ts"
if node "$RECORD" safes broadcast/CreateSafes.s.sol/84532/run-latest.json "$RPC" "$OUT/x.json" >/dev/null 2>&1; then
  die "the record tool accepted an Anvil fork as Base Sepolia"
fi
node "$RECORD" safes broadcast/CreateSafes.s.sol/84532/run-latest.json "$RPC" "$OUT/safes.json" \
  --local-anvil >/dev/null || die "Safes record not verified"
node -e "const s=require('./$OUT/safes.json'); console.log('singleton', s.singleton); for (const [k,v] of Object.entries(s.safes)) console.log(' ', k.padEnd(22), v)"

log "Config, plan, deployment and verification"
node "$ROOT/packages/deploy/src/safes-config-cli.ts" "$OUT/safes.json" 2027-01-01T00:00:00Z \
  "$OUT/config.json" || die "config rejected"
node "$ROOT/packages/deploy/src/cli.ts" "$OUT/config.json" "$OUT/plan.json" || die "plan rejected"
ARL_PLAN="$OUT/plan.json" \
  forge script script/DeployARL.s.sol:DeployARL \
  --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER" --slow >/dev/null ||
  die "DeployARL failed"
node "$RECORD" arl broadcast/DeployARL.s.sol/84532/run-latest.json "$RPC" "$OUT/deployment.json" \
  --local-anvil >/dev/null || die "deployment record not verified"
[[ "$(node -e "console.log(require('./$OUT/deployment.json').verified.network)")" == \
  "base-sepolia-fork-rehearsal" ]] || die "fork record is not stamped as a rehearsal"
ARL_PLAN="$OUT/plan.json" ARL_DEPLOYMENT="$OUT/deployment.json" \
  forge script script/VerifyARL.s.sol:VerifyARL --rpc-url "$RPC" -q || die "VerifyARL failed"
node "$ROOT/packages/deploy/src/manifest-cli.ts" "$OUT/plan.json" "$OUT/deployment.json" \
  "$OUT/manifest.json" || die "manifest failed"
SUPPLY="$(node "$ROOT/packages/deploy/src/supply-cli.ts" "$OUT/manifest.json" "$RPC")"
node -e "const s=JSON.parse(process.argv[1]); console.log('total', s.totalSupplyArl, 'circulating', s.circulatingSupplyArl); if (s.circulatingSupplyArl !== '2100000') process.exit(1)" "$SUPPLY" ||
  die "circulating supply at TGE is not 2,100,000 ARL"

log "FORK REHEARSAL PASSED on a local Base Sepolia fork; nothing was sent to Base Sepolia"
