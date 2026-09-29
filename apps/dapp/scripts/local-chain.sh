#!/usr/bin/env bash
# Starts a fresh local Anvil chain for the app and deploys the fixture into it.
#   npm run chain        (then, in another terminal: npm run dev)
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${ARL_ANVIL_PORT:-8545}"
export ARL_RPC_URL="http://127.0.0.1:$PORT"

command -v anvil >/dev/null || { echo "anvil not found (install Foundry v1.8.3)" >&2; exit 1; }
if cast chain-id --rpc-url "$ARL_RPC_URL" >/dev/null 2>&1; then
  echo "port $PORT already serves a chain; set ARL_ANVIL_PORT" >&2
  exit 1
fi

# One block every 2 s so that time (vesting, staking rewards) moves on screen.
anvil --port "$PORT" --chain-id 31337 --block-time 2 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do cast chain-id --rpc-url "$ARL_RPC_URL" >/dev/null 2>&1 && break; sleep 0.2; done

bash "$APP/scripts/deploy-fixture.sh"
echo "ARL local chain ready at $ARL_RPC_URL (Ctrl-C to stop)"
wait "$ANVIL_PID"
