#!/usr/bin/env bash
# The ARL app on a LOCAL fork of Base Sepolia, end to end. Nothing is sent to Base Sepolia: the
# app is built with the fork as its only RPC, and the operator is a fresh key made for this run.
#
#   1. fork Base Sepolia; deploy and fund the ecosystem (scripts/rehearse-sepolia-ecosystem.sh)
#   2. record it, register the demo service, generate the app's contracts for Base Sepolia
#   3. build the app for Base Sepolia and start it with the operator key
#   4. test-fork/operator.fork.test.ts: faucet, staking, jobs, group join, anonymous vote through
#      the relayer, x402 settlement, all through the app's own server
#   5. every page answers 200 and renders without an application error
#
# Usage (from apps/dapp): bash scripts/rehearse-sepolia-app.sh [fork-rpc-url]
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"
# Tenderly's public gateway serves wide eth_getLogs ranges, which the fork forwards for history.
FORK_URL="${1:-https://base-sepolia.gateway.tenderly.co}"
PORT="${ARL_FORK_PORT:-18770}"
APP_PORT="${ARL_APP_PORT:-3219}"
RPC="http://127.0.0.1:$PORT"
WORK="$(mktemp -d)"
OUT="deploy/deployments/fork-84532-app"
GENERATED="$APP/contracts/baseSepoliaContracts.ts"

die() {
  printf '\nSEPOLIA APP REHEARSAL FAILED: %s\n' "$*" >&2
  exit 1
}
cleanup() {
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "${ANVIL_PID:-}" ]] && kill "$ANVIL_PID" 2>/dev/null || true
  # The committed contracts file is restored; the Base Sepolia build is not kept.
  [[ -f "$WORK/baseSepoliaContracts.ts" ]] && cp "$WORK/baseSepoliaContracts.ts" "$GENERATED"
  rm -rf "$WORK" "$APP/.next-sepolia" 2>/dev/null || true
}
trap cleanup EXIT
cp "$GENERATED" "$WORK/baseSepoliaContracts.ts"

if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then die "port $PORT is in use"; fi
anvil --port "$PORT" --fork-url "$FORK_URL" --auto-impersonate --silent &
ANVIL_PID=$!
for _ in $(seq 1 150); do
  if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
[[ "$(cast chain-id --rpc-url "$RPC")" == "84532" ]] || die "fork did not start as chain 84532"

KEY="$(cast wallet new --json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data[0].private_key))")"
OPERATOR="$(cast wallet address --private-key "$KEY")"
echo "operator for this run: $OPERATOR"

ARL_USE_FORK="$RPC" ARL_OPERATOR="$OPERATOR" ARL_FORK_OUT="$OUT" \
  bash "$ROOT/scripts/rehearse-sepolia-ecosystem.sh" || die "ecosystem rehearsal"

# Gas for the operator's own transactions on the fork (Anvil prices gas above Base Sepolia).
cast rpc anvil_setBalance "$OPERATOR" "$(cast to-hex 1000000000000000000)" --rpc-url "$RPC" >/dev/null

cd "$APP"
node scripts/record-sepolia.ts "$ROOT/contracts/$OUT/ecosystem.json" "$ROOT/contracts/$OUT/signal.json" \
  "$OPERATOR" "$WORK/base-sepolia.json" || die "record"
ARL_OPERATOR_UNLOCKED=1 node scripts/seed-sepolia.ts "$RPC" "$WORK/base-sepolia.json" \
  "http://127.0.0.1:$APP_PORT" || die "seed"
ARL_SEPOLIA_RECORD="$WORK/base-sepolia.json" node scripts/generate-sepolia-contracts.ts || die "generate"

echo "==> building the app for Base Sepolia (fork RPC only)"
NEXT_PUBLIC_ARL_CHAIN=84532 NEXT_PUBLIC_ARL_RPC_URL="$RPC" npx next build >"$WORK/build.log" 2>&1 ||
  { tail -40 "$WORK/build.log"; die "next build"; }
if curl -s "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then die "port $APP_PORT is in use"; fi
# The server itself (not an npx wrapper), so that cleanup stops it.
ARL_OPERATOR_KEY="$KEY" NEXT_PUBLIC_ARL_CHAIN=84532 NEXT_PUBLIC_ARL_RPC_URL="$RPC" \
  node node_modules/next/dist/bin/next start -p "$APP_PORT" -H 127.0.0.1 >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do
  if curl -sf "http://127.0.0.1:$APP_PORT/" >/dev/null; then break; fi
  sleep 0.3
done

echo "==> operator flows through the app's server"
ARL_APP_URL="http://127.0.0.1:$APP_PORT" ARL_FORK_RPC="$RPC" ARL_SEPOLIA_RECORD="$WORK/base-sepolia.json" \
  node --test test-fork/operator.fork.test.ts || { tail -40 "$WORK/server.log"; die "operator flows"; }

echo "==> every page answers"
for page in / /staking /vesting /jobs /payments /private /network /claim /trade /deploy; do
  code="$(curl -s -o "$WORK/page.html" -w '%{http_code}' "http://127.0.0.1:$APP_PORT$page")"
  [[ "$code" == "200" ]] || die "$page answered $code"
  if grep -q "Application error" "$WORK/page.html"; then die "$page rendered an application error"; fi
  echo "ok  $page"
done

printf '\n==> SEPOLIA APP REHEARSAL PASSED; nothing was sent to Base Sepolia\n'
