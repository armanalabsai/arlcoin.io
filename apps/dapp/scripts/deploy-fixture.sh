#!/usr/bin/env bash
# Deploys the app's local fixture (contracts/script/DevDapp.s.sol) to the Anvil chain at
# $ARL_RPC_URL and regenerates contracts/deployedContracts.ts (with --check: verifies that the
# committed file matches the deployment instead). Local Anvil only: the script
# itself refuses any other chain. Anvil unlocks its development accounts; no key is used.
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="$APP/../../contracts"
RPC="${ARL_RPC_URL:-http://127.0.0.1:8545}"
OPERATOR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

[[ "$(cast chain-id --rpc-url "$RPC")" == "31337" ]] || { echo "not a local Anvil chain: $RPC" >&2; exit 1; }

# Canonical Permit2, x402 upto proxy and ERC-8004 IdentityRegistry code (Payments, Network).
node "$APP/scripts/install-canonical.ts" "$RPC"

cd "$CONTRACTS"
if ! out="$(forge build --skip test 2>&1)"; then echo "$out" >&2; exit 1; fi
forge script script/DevDapp.s.sol:DevDapp --rpc-url "$RPC" --broadcast --unlocked \
  --sender "$OPERATOR" --slow -q
# The anonymous-signal verifier and contract, and the demo poll group (Private screen).
FOUNDRY_PROFILE=zk forge script zk-script/DevZk.s.sol:DevZk --rpc-url "$RPC" --broadcast \
  --unlocked --sender "$OPERATOR" --slow -q
node "$APP/scripts/deploy-zk.ts" "$RPC"

# The demo service on the ERC-8004 registry (Network and Payments screens).
node "$APP/scripts/seed-network.ts" "$RPC"

if [[ "${1:-}" == "--check" ]]; then
  node "$APP/scripts/generate-contracts.ts" --check
else
  node "$APP/scripts/generate-contracts.ts"
  (cd "$APP/../.." && npx prettier --write apps/dapp/contracts/deployedContracts.ts >/dev/null)
fi
