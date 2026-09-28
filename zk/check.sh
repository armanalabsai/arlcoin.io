#!/usr/bin/env bash
# Rebuilds the ARL anonymous signal circuit and its Solidity verifier and checks that the
# committed artifacts match: packages/zk/circuit/arl_semaphore.json and
# contracts/zk/ARLSemaphoreVerifier.sol. Also runs the circuit's own tests.
# Requires nargo 1.0.0-rc.3 and bb 5.2.0.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCUIT="$ROOT/zk/semaphore"

nargo --version | grep -q "nargo version = 1.0.0-rc.3" || { echo "need nargo 1.0.0-rc.3" >&2; exit 1; }
[[ "$(bb --version)" == "5.2.0" ]] || { echo "need bb 5.2.0" >&2; exit 1; }

cd "$CIRCUIT"
nargo test
nargo compile
bb write_vk -b target/arl_semaphore.json -o target -t evm
bb write_solidity_verifier -k target/vk -o target/ARLSemaphoreVerifier.sol -t evm

node -e '
const fs = require("fs");
const a = JSON.parse(fs.readFileSync(process.argv[1])), b = JSON.parse(fs.readFileSync(process.argv[2]));
if (a.bytecode !== b.bytecode || JSON.stringify(a.abi) !== JSON.stringify(b.abi)) {
  console.error("packages/zk/circuit/arl_semaphore.json is out of date"); process.exit(1);
}' target/arl_semaphore.json "$ROOT/packages/zk/circuit/arl_semaphore.json"

# The verifier is committed exactly as generated (it is excluded from forge fmt).
if ! cmp -s target/ARLSemaphoreVerifier.sol "$ROOT/contracts/zk/ARLSemaphoreVerifier.sol"; then
  echo "contracts/zk/ARLSemaphoreVerifier.sol is out of date" >&2
  exit 1
fi
echo "circuit and verifier match the committed artifacts"
