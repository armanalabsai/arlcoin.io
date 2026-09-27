#!/usr/bin/env bash
# Local deployment rehearsal on a fresh Anvil chain. No public network is touched.
#
#   1. start a clean Anvil chain
#   2. build the plan from contracts/deploy/config/local.json
#   3. deploy the complete system (DeployARL validates, deploys and verifies)
#   4. run the read-only verifier (VerifyARL) again as a separate step
#   5. cross-check key values independently with `cast`
#   6. run negative rehearsals: each must be rejected, and rejected deployments must not
#      broadcast anything
#
# Exits 0 only if every step and every negative case behaves as expected.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="$ROOT/contracts"
PORT="${ARL_ANVIL_PORT:-18545}"
RPC="http://127.0.0.1:$PORT"
PLANS="deploy/plans"
REHEARSAL="$PLANS/rehearsal"
PLAN="$PLANS/local.json"
DEPLOYMENT="deploy/deployments/31337.json"

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\nREHEARSAL FAILED: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${ANVIL_PID:-}" ]]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

command -v anvil >/dev/null || die "anvil not found (install Foundry v1.8.3)"
if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  die "port $PORT is already serving a chain; set ARL_ANVIL_PORT to a free port"
fi

log "Starting a clean Anvil chain on port $PORT"
anvil --port "$PORT" --chain-id 31337 --silent &
ANVIL_PID=$!
for _ in $(seq 1 50); do
  if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
[[ "$(cast chain-id --rpc-url "$RPC")" == "31337" ]] || die "Anvil did not start"
[[ "$(cast block-number --rpc-url "$RPC")" == "0" ]] || die "chain is not fresh"

# Anvil's first pre-funded development account. It is unlocked by Anvil; no key is used here.
DEPLOYER="$(cast rpc eth_accounts --rpc-url "$RPC" | tr -d '[]" ' | cut -d, -f1)"

cd "$CONTRACTS"
rm -rf "$PLANS" deploy/deployments
mkdir -p "$REHEARSAL" deploy/deployments

log "Building the deployment plan"
node "$ROOT/packages/deploy/src/cli.ts" deploy/config/local.json "$PLAN"

forge_deploy() {
  ARL_PLAN="$1" ARL_DEPLOYMENT="$2" forge script script/DeployARL.s.sol:DeployARL \
    --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER" --slow
}
forge_verify() {
  ARL_PLAN="$1" ARL_DEPLOYMENT="$2" forge script script/VerifyARL.s.sol:VerifyARL \
    --rpc-url "$RPC" -q
}

log "Deploying the complete system"
forge_deploy "$PLAN" "$DEPLOYMENT" || die "deployment failed"
[[ -f "$DEPLOYMENT" ]] || die "deployment addresses were not written"

log "Running the post-deployment verifier"
forge_verify "$PLAN" "$DEPLOYMENT" || die "verifier rejected the deployment"

log "Independent checks with cast"
addr() { node -e "console.log(require('./$DEPLOYMENT').$1)"; }
TOKEN="$(addr token)"
TIMELOCK="$(addr timelock)"
FOUNDER_VESTING="$(addr founderVesting)"
RESERVE_VESTING="$(addr reserveVesting)"
expect() {
  local what="$1" want="$2" got="$3"
  [[ "$got" == "$want" ]] || die "$what: expected $want, got $got"
  printf '  ok  %-34s %s\n' "$what" "$got"
}
num() { cast call "$@" --rpc-url "$RPC" | cut -d' ' -f1; }
expect "totalSupply" "21000000000000000000000000" "$(num "$TOKEN" 'totalSupply()(uint256)')"
expect "treasury balance" "3000000000000000000000000" \
  "$(num "$TOKEN" 'balanceOf(address)(uint256)' "$TIMELOCK")"
expect "founder vesting balance" "2100000000000000000000000" \
  "$(num "$TOKEN" 'balanceOf(address)(uint256)' "$FOUNDER_VESTING")"
expect "reserve vesting balance" "7000000000000000000000000" \
  "$(num "$TOKEN" 'balanceOf(address)(uint256)' "$RESERVE_VESTING")"
expect "deployer balance" "0" "$(num "$TOKEN" 'balanceOf(address)(uint256)' "$DEPLOYER")"
expect "timelock delay (s)" "172800" "$(num "$TIMELOCK" 'getMinDelay()(uint256)')"
expect "founder cliff end" "1861920000" "$(num "$FOUNDER_VESTING" 'cliffEnd()(uint256)')"
expect "founder vesting end" "1956528000" "$(num "$FOUNDER_VESTING" 'vestingEnd()(uint256)')"
expect "reserve duration (s)" "158112000" "$(num "$RESERVE_VESTING" 'duration()(uint256)')"
GUARDIAN="$(node -e "console.log(require('./$PLAN').treasury.guardian)")"
role() { cast call "$TIMELOCK" "$1()(bytes32)" --rpc-url "$RPC"; }
has_role() { cast call "$TIMELOCK" 'hasRole(bytes32,address)(bool)' "$(role "$1")" "$2" --rpc-url "$RPC"; }
expect "guardian is canceller" "true" "$(has_role CANCELLER_ROLE "$GUARDIAN")"
expect "guardian is not proposer" "false" "$(has_role PROPOSER_ROLE "$GUARDIAN")"
expect "guardian is not executor" "false" "$(has_role EXECUTOR_ROLE "$GUARDIAN")"
expect "zero address is not executor" "false" \
  "$(has_role EXECUTOR_ROLE 0x0000000000000000000000000000000000000000)"

# Writes a copy of the plan with one field changed: mutate <out> <js expression on p>.
mutate() {
  node -e "const p=require('./$PLAN'); $2; require('fs').writeFileSync('$1', JSON.stringify(p));"
}
NEGATIVE=0
# must_fail <name> <expected error pattern> <command...>
# The command must fail, and its output must name the expected reason.
must_fail() {
  local name="$1" pattern="$2" output
  shift 2
  if output="$("$@" 2>&1)"; then die "negative case was accepted: $name"; fi
  if ! grep -qE "$pattern" <<<"$output"; then
    printf '%s\n' "$output" >&2
    die "negative case failed for the wrong reason: $name (expected /$pattern/)"
  fi
  printf '  ok  rejected: %-44s [%s]\n' "$name" "$(grep -oE "$pattern" <<<"$output" | head -1)"
  NEGATIVE=$((NEGATIVE + 1))
}
nonce() { cast nonce "$DEPLOYER" --rpc-url "$RPC"; }

log "Negative rehearsals: the verifier must reject a deployment that differs from the plan"
mutate "$REHEARSAL/wrong-recipient.json" "p.recipients.liquidity='0x000000000000000000000000000000000000dEaD'"
must_fail "wrong recipient" "VerifyUintMismatch\\(\"allocation balance\"" forge_verify "$REHEARSAL/wrong-recipient.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-timestamp.json" "p.founder.cliffEnd += 1"
must_fail "wrong founder timestamp" "VerifyUintMismatch\\(\"founder cliff end\"" forge_verify "$REHEARSAL/wrong-timestamp.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-beneficiary.json" "p.founder.beneficiary='0x000000000000000000000000000000000000dEaD'"
must_fail "wrong founder beneficiary" "VerifyAddressMismatch\\(\"founder beneficiary\"" \
  forge_verify "$REHEARSAL/wrong-beneficiary.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-safe.json" "p.treasury.safe='0x000000000000000000000000000000000000dEaD'"
must_fail "wrong treasury safe" "VerifyFailed\\(\"treasury safe is proposer\"" forge_verify "$REHEARSAL/wrong-safe.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-guardian.json" "p.treasury.guardian='0x000000000000000000000000000000000000dEaD'"
must_fail "wrong treasury guardian" "VerifyFailed\\(\"guardian is canceller\"" forge_verify "$REHEARSAL/wrong-guardian.json" "$DEPLOYMENT"

log "Negative rehearsals: DeployARL must refuse invalid plans before broadcasting"
BEFORE="$(nonce)"
mutate "$REHEARSAL/bad-ordering.json" "p.founder.cliffEnd = p.founder.cliffStart - 1"
must_fail "invalid cliff/end ordering" "PlanInvalidSchedule\\(\"founder cliff end is not after cliff start\"" forge_deploy "$REHEARSAL/bad-ordering.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/bad-cliff.json" "p.founder.cliffEnd = p.founder.cliffStart + 720*86400"
must_fail "cliff of 24 x 30 days" "PlanInvalidSchedule\\(\"founder cliff is not 24 calendar months\"" forge_deploy "$REHEARSAL/bad-cliff.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/zero-executor.json" "p.treasury.safe='0x0000000000000000000000000000000000000000'"
must_fail "zero executor" "PlanZeroAddress\\(\"treasury.safe\"" forge_deploy "$REHEARSAL/zero-executor.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/zero-guardian.json" "p.treasury.guardian='0x0000000000000000000000000000000000000000'"
must_fail "zero guardian" "PlanZeroAddress\\(\"treasury.guardian\"" forge_deploy "$REHEARSAL/zero-guardian.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/guardian-is-safe.json" "p.treasury.guardian=p.treasury.safe"
must_fail "guardian is the treasury safe" "PlanGuardianNotIndependent" forge_deploy "$REHEARSAL/guardian-is-safe.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/short-delay.json" "p.treasury.minDelay = 172799"
must_fail "timelock delay below 48 hours" "PlanDelayBelowFloor\\(172799 " \
  forge_deploy "$REHEARSAL/short-delay.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/allocation.json" "p.allocations.founder = (BigInt(p.allocations.founder) + 1n).toString()"
must_fail "allocation mismatch" "PlanAllocationMismatch\\(\"founder\"" forge_deploy "$REHEARSAL/allocation.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/supply.json" "p.maxSupply = '22000000000000000000000000'"
must_fail "max supply mismatch" "PlanSupplyMismatch\\(22000000" forge_deploy "$REHEARSAL/supply.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/zero-recipient.json" "p.recipients.team='0x0000000000000000000000000000000000000000'"
must_fail "zero recipient" "PlanZeroAddress\\(\"recipients.team\"" forge_deploy "$REHEARSAL/zero-recipient.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/chain.json" "p.chainId = 1"
must_fail "chain id mismatch" "PlanChainMismatch\\(1, 31337" forge_deploy "$REHEARSAL/chain.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/code.json" "p.requireRecipientCode = true"
must_fail "recipients without code" "PlanRecipientHasNoCode" forge_deploy "$REHEARSAL/code.json" "$REHEARSAL/x.json"
[[ "$(nonce)" == "$BEFORE" ]] || die "a rejected deployment broadcast a transaction"
printf '  ok  deployer nonce unchanged (%s): nothing was broadcast\n' "$BEFORE"

log "Negative rehearsals: the planner must refuse invalid configs"
bad_config() {
  node -e "const c=require('./deploy/config/local.json'); $2; require('fs').writeFileSync('$1', JSON.stringify(c));"
}
bad_config "$REHEARSAL/cfg-delay.json" "c.treasury.minDelayHours = 47"
must_fail "planner: delay below 48 hours" "below the 48-hour minimum" \
  node "$ROOT/packages/deploy/src/cli.ts" "$REHEARSAL/cfg-delay.json" "$REHEARSAL/p.json"
bad_config "$REHEARSAL/cfg-zero.json" "c.treasury.safe='0x0000000000000000000000000000000000000000'"
must_fail "planner: zero executor" "treasury.safe: zero address" \
  node "$ROOT/packages/deploy/src/cli.ts" "$REHEARSAL/cfg-zero.json" "$REHEARSAL/p.json"
bad_config "$REHEARSAL/cfg-guardian.json" "c.treasury.guardian=c.treasury.safe"
must_fail "planner: guardian is the treasury safe" "treasury.guardian: must differ from treasury.safe" \
  node "$ROOT/packages/deploy/src/cli.ts" "$REHEARSAL/cfg-guardian.json" "$REHEARSAL/p.json"
bad_config "$REHEARSAL/cfg-date.json" "c.launchDate='2027-01-31T00:00:00Z'"
must_fail "planner: ambiguous month arithmetic" "day of month must be 1-28" \
  node "$ROOT/packages/deploy/src/cli.ts" "$REHEARSAL/cfg-date.json" "$REHEARSAL/p.json"
bad_config "$REHEARSAL/cfg-chain.json" "c.chainId = 11155111"
must_fail "planner: non-local chain without code checks" "requireRecipientCode: may be false only" \
  node "$ROOT/packages/deploy/src/cli.ts" "$REHEARSAL/cfg-chain.json" "$REHEARSAL/p.json"
[[ ! -f "$REHEARSAL/p.json" ]] || die "a rejected config produced a plan"

log "REHEARSAL PASSED: deployed, verified, and $NEGATIVE negative cases rejected"
