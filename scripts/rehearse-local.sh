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
#   7. deploy real Safe contracts, redeploy with every Safe role held by its own Safe and code
#      checks enforced, and reject a Founder recipient without code and any Safe role that is
#      not a genuine Safe v1.5.0 proxy.
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

GATE_PIDS=()
cleanup() {
  for pid in "${ANVIL_PID:-}" "${GATE_PIDS[@]}"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  done
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
planval() { node -e "console.log(require('./$PLAN').$1)"; }
TOKEN="$(addr token)"
TIMELOCK="$(addr timelock)"
INVESTORS_VESTING="$(addr investorsVesting)"
PARTNERSHIPS_VESTING="$(addr partnershipsVesting)"
expect() {
  local what="$1" want="$2" got="$3"
  [[ "$got" == "$want" ]] || die "$what: expected $want, got $got"
  printf '  ok  %-38s %s\n' "$what" "$got"
}
num() { cast call "$@" --rpc-url "$RPC" | cut -d' ' -f1; }
balance() { num "$TOKEN" 'balanceOf(address)(uint256)' "$1"; }
expect "totalSupply" "21000000000000000000000000" "$(num "$TOKEN" 'totalSupply()(uint256)')"
# The eleven canonical allocations at their eleven genesis holders.
expect "public launch balance" "5000000000000000000000000" "$(balance "$(planval recipients.publicLaunch)")"
expect "community & staking balance" "3000000000000000000000000" "$(balance "$(planval recipients.communityStaking)")"
expect "ecosystem & growth balance" "2000000000000000000000000" "$(balance "$(planval recipients.ecosystemGrowth)")"
expect "strategic partnerships vesting balance" "2000000000000000000000000" "$(balance "$PARTNERSHIPS_VESTING")"
expect "liquidity balance" "2000000000000000000000000" "$(balance "$(planval recipients.liquidity)")"
expect "founder balance" "2100000000000000000000000" "$(balance "$(planval recipients.founder)")"
expect "investors vesting balance" "1500000000000000000000000" "$(balance "$INVESTORS_VESTING")"
expect "treasury balance" "1000000000000000000000000" "$(balance "$TIMELOCK")"
expect "team pool balance" "900000000000000000000000" "$(balance "$(planval recipients.team)")"
expect "early users balance" "1100000000000000000000000" "$(balance "$(planval recipients.earlyUsers)")"
expect "grants / bug bounty balance" "400000000000000000000000" "$(balance "$(planval recipients.grantsBugBounty)")"
expect "deployer balance" "0" "$(balance "$DEPLOYER")"
expect "timelock delay (s)" "172800" "$(num "$TIMELOCK" 'getMinDelay()(uint256)')"
expect "no founder vesting wallet recorded" "undefined" "$(addr founderVesting)"
expect "investors cliff end" "$(planval vesting.investors.cliffEnd)" "$(num "$INVESTORS_VESTING" 'cliffEnd()(uint256)')"
expect "investors vesting end" "$(planval vesting.investors.vestingEnd)" "$(num "$INVESTORS_VESTING" 'vestingEnd()(uint256)')"
expect "investors releasable at start" "0" "$(num "$INVESTORS_VESTING" 'releasable(address)(uint256)' "$TOKEN")"
GUARDIAN="$(planval treasury.guardian)"
role() { cast call "$TIMELOCK" "$1()(bytes32)" --rpc-url "$RPC"; }
has_role() { cast call "$TIMELOCK" 'hasRole(bytes32,address)(bool)' "$(role "$1")" "$2" --rpc-url "$RPC"; }
expect "guardian is canceller" "true" "$(has_role CANCELLER_ROLE "$GUARDIAN")"
expect "guardian is not proposer" "false" "$(has_role PROPOSER_ROLE "$GUARDIAN")"
expect "guardian is not executor" "false" "$(has_role EXECUTOR_ROLE "$GUARDIAN")"
expect "zero address is not executor" "false" \
  "$(has_role EXECUTOR_ROLE 0x0000000000000000000000000000000000000000)"

log "Deployment manifest and circulating supply (economic specification sections 5 and 6)"
MANIFEST="deploy/deployments/31337-manifest.json"
node "$ROOT/packages/deploy/src/manifest-cli.ts" "$PLAN" "$DEPLOYMENT" "$MANIFEST" || die "manifest failed"
supply() { node "$ROOT/packages/deploy/src/supply-cli.ts" "$MANIFEST" "$RPC" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).$1))"; }
expect "total supply (manifest read)" "21000000000000000000000000" "$(supply totalSupply)"
expect "circulating supply at TGE" "2100000000000000000000000" "$(supply circulatingSupply)"
expect "locked supply at TGE" "18900000000000000000000000" "$(supply lockedSupply)"

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
  printf '  ok  rejected: %-48s [%s]\n' "$name" "$(grep -oE "$pattern" <<<"$output" | head -1)"
  NEGATIVE=$((NEGATIVE + 1))
}
nonce() { cast nonce "$DEPLOYER" --rpc-url "$RPC"; }
DEAD=0x000000000000000000000000000000000000dEaD
ZERO=0x0000000000000000000000000000000000000000

log "Negative rehearsals: the verifier must reject a deployment that differs from the plan"
mutate "$REHEARSAL/wrong-recipient.json" "p.recipients.liquidity='$DEAD'"
must_fail "wrong recipient" "VerifyUintMismatch\\(\"allocation balance\"" forge_verify "$REHEARSAL/wrong-recipient.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-timestamp.json" "p.vesting.investors.cliffEnd += 1"
must_fail "wrong investors timestamp" "VerifyUintMismatch\\(\"investors cliff end\"" forge_verify "$REHEARSAL/wrong-timestamp.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-founder.json" "p.recipients.founder='$DEAD'"
must_fail "wrong founder holder" "VerifyUintMismatch\\(\"allocation balance\"" \
  forge_verify "$REHEARSAL/wrong-founder.json" "$DEPLOYMENT"
node -e "const d=require('./$DEPLOYMENT'); d.founderVesting='$DEAD'; require('fs').writeFileSync('$REHEARSAL/legacy-deployment.json', JSON.stringify(d));"
must_fail "deployment record with a founder vesting wallet" "VerifyFailed\\(\"no founder vesting wallet\"" \
  forge_verify "$PLAN" "$REHEARSAL/legacy-deployment.json"
mutate "$REHEARSAL/wrong-investor.json" "p.vesting.investors.beneficiary='$DEAD'"
must_fail "wrong investors beneficiary" "VerifyAddressMismatch\\(\"investors beneficiary\"" \
  forge_verify "$REHEARSAL/wrong-investor.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-safe.json" "p.treasury.safe='$DEAD'"
must_fail "wrong treasury safe" "VerifyFailed\\(\"treasury safe is proposer\"" forge_verify "$REHEARSAL/wrong-safe.json" "$DEPLOYMENT"
mutate "$REHEARSAL/wrong-guardian.json" "p.treasury.guardian='$DEAD'"
must_fail "wrong treasury guardian" "VerifyFailed\\(\"guardian is canceller\"" forge_verify "$REHEARSAL/wrong-guardian.json" "$DEPLOYMENT"

log "Negative rehearsals: DeployARL must refuse invalid plans before broadcasting"
BEFORE="$(nonce)"
mutate "$REHEARSAL/bad-ordering.json" "p.vesting.investors.cliffEnd = p.vesting.investors.cliffStart - 1"
must_fail "invalid cliff/start ordering" "PlanInvalidSchedule\\(\"investors cliff end is before its start\"" forge_deploy "$REHEARSAL/bad-ordering.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/old-schema.json" "p.schema = 'arl-deploy-plan/2'"
must_fail "old plan schema" "PlanSchemaMismatch\\(\"arl-deploy-plan/2\"" forge_deploy "$REHEARSAL/old-schema.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/schema-3.json" "p.schema = 'arl-deploy-plan/3'; delete p.safe"
must_fail "plan without Safe singletons (schema 3)" "PlanSchemaMismatch\\(\"arl-deploy-plan/3\"" forge_deploy "$REHEARSAL/schema-3.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/founder-vesting.json" "p.vesting.founder = p.vesting.investors"
must_fail "plan with a founder vesting wallet" "PlanFounderVestingNotAllowed" forge_deploy "$REHEARSAL/founder-vesting.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/tranche.json" "p.founderTranches = {unrestricted: '2000000000000000000000000', reserved: '100000000000000000000000'}"
must_fail "plan that splits the founder allocation" "PlanLegacyAllocation\\(\"founderTranches\"" forge_deploy "$REHEARSAL/tranche.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/founder-reuse.json" "p.recipients.founder = p.treasury.safe"
must_fail "founder shares an address with the treasury" "PlanAddressReused\\(\"treasury.safe\", \"recipients.founder\"" forge_deploy "$REHEARSAL/founder-reuse.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/bad-end.json" "p.vesting.investors.vestingEnd = p.vesting.investors.cliffEnd"
must_fail "vesting end not after cliff end" "PlanInvalidSchedule\\(\"investors vesting end is not after cliff end\"" forge_deploy "$REHEARSAL/bad-end.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/short-vesting.json" "p.vesting.strategicPartnerships.vestingEnd -= 86400"
must_fail "linear vesting not 36 calendar months" "PlanInvalidSchedule\\(\"strategicPartnerships linear vesting is not 36 calendar months\"" forge_deploy "$REHEARSAL/short-vesting.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/zero-executor.json" "p.treasury.safe='$ZERO'"
must_fail "zero executor" "PlanZeroAddress\\(\"treasury.safe\"" forge_deploy "$REHEARSAL/zero-executor.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/zero-guardian.json" "p.treasury.guardian='$ZERO'"
must_fail "zero guardian" "PlanZeroAddress\\(\"treasury.guardian\"" forge_deploy "$REHEARSAL/zero-guardian.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/guardian-is-safe.json" "p.treasury.guardian=p.treasury.safe"
must_fail "guardian is the treasury safe" "PlanGuardianNotIndependent" forge_deploy "$REHEARSAL/guardian-is-safe.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/short-delay.json" "p.treasury.minDelay = 172799"
must_fail "timelock delay below 48 hours" "PlanDelayBelowFloor\\(172799 " \
  forge_deploy "$REHEARSAL/short-delay.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/allocation.json" "p.allocations.founder = (BigInt(p.allocations.founder) + 1n).toString()"
must_fail "allocation mismatch (wrong amount)" "PlanAllocationMismatch\\(\"founder\"" forge_deploy "$REHEARSAL/allocation.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/swapped.json" "[p.allocations.founder, p.allocations.investors] = [p.allocations.investors, p.allocations.founder]"
must_fail "allocations swapped (same total)" "PlanAllocationMismatch\\(\"founder\"" forge_deploy "$REHEARSAL/swapped.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/supply.json" "p.maxSupply = '22000000000000000000000000'"
must_fail "max supply mismatch" "PlanSupplyMismatch\\(22000000" forge_deploy "$REHEARSAL/supply.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/total.json" "p.allocations.team = (BigInt(p.allocations.team) - 1n).toString()"
must_fail "total below 21M" "PlanAllocationMismatch\\(\"team\"" forge_deploy "$REHEARSAL/total.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/missing-allocation.json" "delete p.allocations.investors"
must_fail "missing allocation" "PlanUnexpectedKeys\\(\"allocations\", 10, 11" forge_deploy "$REHEARSAL/missing-allocation.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/legacy-reserve.json" "p.allocations.ecosystemReserve = '7000000000000000000000000'"
must_fail "legacy Ecosystem Reserve allocation" "PlanLegacyAllocation\\(\"allocations.ecosystemReserve\"" forge_deploy "$REHEARSAL/legacy-reserve.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/legacy-recipient.json" "p.ecosystemReserve = {beneficiary: '$DEAD', start: 1798761600}"
must_fail "legacy Ecosystem Reserve recipient" "PlanLegacyAllocation\\(\"ecosystemReserve\"" forge_deploy "$REHEARSAL/legacy-recipient.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/extra-recipient.json" "p.recipients.earlyUserRewards = '$DEAD'"
must_fail "wrong recipient count" "PlanUnexpectedKeys\\(\"recipients\", 9, 8" forge_deploy "$REHEARSAL/extra-recipient.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/duplicate.json" "p.recipients.liquidity = p.recipients.communityStaking"
must_fail "duplicate allocation holder" "PlanAddressReused\\(\"recipients.liquidity\"" forge_deploy "$REHEARSAL/duplicate.json" "$REHEARSAL/x.json"
mutate "$REHEARSAL/zero-recipient.json" "p.recipients.team='$ZERO'"
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
planner() { node "$ROOT/packages/deploy/src/cli.ts" "$1" "$REHEARSAL/p.json"; }
bad_config "$REHEARSAL/cfg-delay.json" "c.treasury.minDelayHours = 47"
must_fail "planner: delay below 48 hours" "below the 48-hour minimum" planner "$REHEARSAL/cfg-delay.json"
bad_config "$REHEARSAL/cfg-zero.json" "c.treasury.safe='$ZERO'"
must_fail "planner: zero executor" "treasury.safe: zero address" planner "$REHEARSAL/cfg-zero.json"
bad_config "$REHEARSAL/cfg-guardian.json" "c.treasury.guardian=c.treasury.safe"
must_fail "planner: guardian is the treasury safe" "treasury.guardian: must differ from treasury.safe" planner "$REHEARSAL/cfg-guardian.json"
bad_config "$REHEARSAL/cfg-date.json" "c.vesting.investors.start='2027-01-31T00:00:00Z'"
must_fail "planner: ambiguous month arithmetic" "day of month must be 1-28" planner "$REHEARSAL/cfg-date.json"
bad_config "$REHEARSAL/cfg-chain.json" "c.chainId = 84532"
must_fail "planner: non-local chain without code checks" "requireRecipientCode: may be false only" planner "$REHEARSAL/cfg-chain.json"
bad_config "$REHEARSAL/cfg-mainnet.json" "c.chainId = 8453; c.network = 'base'; c.requireRecipientCode = true"
must_fail "planner: Base Mainnet config" "chainId: 8453 \\(Base Mainnet\\) is locked" planner "$REHEARSAL/cfg-mainnet.json"
bad_config "$REHEARSAL/cfg-unsupported.json" "c.chainId = 11155111; c.requireRecipientCode = true"
must_fail "planner: unsupported chain" "chainId: 11155111 is not supported" planner "$REHEARSAL/cfg-unsupported.json"
bad_config "$REHEARSAL/cfg-cliff.json" "c.vesting.investors.cliffMonths = 6"
must_fail "planner: cliff other than 12 months" "cliffMonths: must be 12 \\(approved schedule\\)" planner "$REHEARSAL/cfg-cliff.json"
bad_config "$REHEARSAL/cfg-legacy.json" "c.ecosystemReserveBeneficiary = c.treasury.safe"
must_fail "planner: legacy Ecosystem Reserve key" "ecosystemReserveBeneficiary: unexpected key" planner "$REHEARSAL/cfg-legacy.json"
bad_config "$REHEARSAL/cfg-reuse.json" "c.recipients.earlyUsers = c.recipients.communityStaking"
must_fail "planner: address reused" "every address must be dedicated" planner "$REHEARSAL/cfg-reuse.json"
bad_config "$REHEARSAL/cfg-founder-vesting.json" "c.vesting.founder = c.vesting.investors"
must_fail "planner: founder vesting config" "vesting.founder: the Founder allocation does not vest" planner "$REHEARSAL/cfg-founder-vesting.json"
[[ ! -f "$REHEARSAL/p.json" ]] || die "a rejected config produced a plan"

log "Dedicated Safes: real Safe v1.5.0 contracts on Anvil, code checks enforced"
# Safe v1.5.0 (LGPL-3.0) is deployed here from its published npm build artifacts; no Safe source
# is copied into ARL. Owners are Anvil development accounts; nobody's real keys are involved.
ACCOUNTS="$(cast rpc eth_accounts --rpc-url "$RPC" | tr -d '[]" ')"
account() { cut -d, -f"$(($1 + 1))" <<<"$ACCOUNTS"; }
SAFE_DEPLOYER="$(account 1)"
artifact() { node -e "console.log(require('@safe-global/safe-smart-account/build/artifacts/contracts/$1').bytecode)"; }
create() {
  cast send --unlocked --from "$SAFE_DEPLOYER" --rpc-url "$RPC" --json --create "$1" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).contractAddress))"
}
SAFE_SINGLETON="$(create "$(artifact Safe.sol/Safe.json)")"
# The singleton built from the official npm artifact must have the canonical v1.5.0 code, the
# same code hash ARLDeployPlan pins for public networks.
canonical_hash() { perl -0ne "print \$1 if /constant $1 =\\s*(0x[0-9a-f]+);/" script/ARLDeployPlan.sol; }
expect "safe singleton code hash is canonical" "$(canonical_hash SAFE_SINGLETON_V150_CODEHASH)" \
  "$(cast codehash "$SAFE_SINGLETON" --rpc-url "$RPC")"
SAFE_FACTORY="$(create "$(artifact proxies/SafeProxyFactory.sol/SafeProxyFactory.json)")"
SAFE_SETUP="$(cast calldata 'setup(address[],uint256,address,bytes,address,address,uint256,address)' \
  "[$(account 2),$(account 3),$(account 4)]" 2 "$ZERO" 0x "$ZERO" "$ZERO" 0 "$ZERO")"
# new_safe <salt>: deploys a 2-of-3 Safe proxy and prints its address.
new_safe() {
  local addr
  addr="$(cast call "$SAFE_FACTORY" 'createProxyWithNonce(address,bytes,uint256)(address)' \
    "$SAFE_SINGLETON" "$SAFE_SETUP" "$1" --from "$SAFE_DEPLOYER" --rpc-url "$RPC")"
  cast send "$SAFE_FACTORY" 'createProxyWithNonce(address,bytes,uint256)' "$SAFE_SINGLETON" \
    "$SAFE_SETUP" "$1" --unlocked --from "$SAFE_DEPLOYER" --rpc-url "$RPC" >/dev/null
  printf '%s' "$addr"
}
FOUNDER_SAFE="$(new_safe 1)"
expect "founder safe threshold" "2" "$(num "$FOUNDER_SAFE" 'getThreshold()(uint256)')"
expect "founder safe owners" "3" \
  "$(cast call "$FOUNDER_SAFE" 'getOwners()(address[])' --rpc-url "$RPC" | tr ',' '\n' | grep -c 0x)"

# Every Safe role (12) gets its own Safe proxy so the plan can require code everywhere.
SAFE_PLAN="$REHEARSAL/safes.json"
node -e "
const p = require('./$PLAN');
const s = process.argv.slice(1);
p.requireRecipientCode = true;
p.safe.singletons = ['$SAFE_SINGLETON'];
p.recipients.founder = s[0];
p.vesting.investors.beneficiary = s[1];
p.vesting.strategicPartnerships.beneficiary = s[2];
p.treasury.safe = s[3];
p.treasury.guardian = s[4];
Object.keys(p.recipients)
  .filter((k) => k !== 'founder')
  .forEach((k, i) => (p.recipients[k] = s[5 + i]));
require('fs').writeFileSync('$SAFE_PLAN', JSON.stringify(p));
" "$FOUNDER_SAFE" $(for i in $(seq 2 12); do new_safe "$i"; printf ' '; done)
SAFE_DEPLOYMENT="deploy/deployments/31337-safes.json"
forge_deploy "$SAFE_PLAN" "$SAFE_DEPLOYMENT" >/dev/null || die "deployment with Safe recipients failed"
forge_verify "$SAFE_PLAN" "$SAFE_DEPLOYMENT" || die "verifier rejected the deployment with Safe recipients"
SAFE_TOKEN="$(node -e "console.log(require('./$SAFE_DEPLOYMENT').token)")"
expect "founder safe is a Safe v1.5.0 proxy" "$(canonical_hash SAFE_PROXY_V150_CODEHASH)" \
  "$(cast codehash "$FOUNDER_SAFE" --rpc-url "$RPC")"
expect "founder safe balance" "2100000000000000000000000" \
  "$(num "$SAFE_TOKEN" 'balanceOf(address)(uint256)' "$FOUNDER_SAFE")"

BEFORE="$(nonce)"
node -e "const p=require('./$SAFE_PLAN'); p.recipients.founder='$(account 5)'; require('fs').writeFileSync('$REHEARSAL/founder-eoa.json', JSON.stringify(p));"
must_fail "founder without code" "PlanRecipientHasNoCode\\(\"recipients.founder\"" \
  forge_deploy "$REHEARSAL/founder-eoa.json" "$REHEARSAL/x.json"
node -e "const p=require('./$SAFE_PLAN'); p.recipients.liquidity='$SAFE_FACTORY'; require('fs').writeFileSync('$REHEARSAL/not-a-safe.json', JSON.stringify(p));"
must_fail "contract that is not a Safe proxy" "PlanNotASafe\\(\"recipients.liquidity\"" \
  forge_deploy "$REHEARSAL/not-a-safe.json" "$REHEARSAL/x.json"
node -e "const p=require('./$SAFE_PLAN'); p.safe.singletons=[]; require('fs').writeFileSync('$REHEARSAL/no-singletons.json', JSON.stringify(p));"
must_fail "code required but no Safe singleton listed" "PlanSafeSingletonsMissing" \
  forge_deploy "$REHEARSAL/no-singletons.json" "$REHEARSAL/x.json"
[[ "$(nonce)" == "$BEFORE" ]] || die "a rejected deployment broadcast a transaction"
node -e "const p=require('./$SAFE_PLAN'); p.safe.singletons=['$DEAD']; require('fs').writeFileSync('$REHEARSAL/wrong-singleton.json', JSON.stringify(p));"
must_fail "verify: Safes point to an unlisted singleton" "VerifyFailed\\(\"recipients.founder is a Safe v1.5.0 proxy\"" \
  forge_verify "$REHEARSAL/wrong-singleton.json" "$SAFE_DEPLOYMENT"
must_fail "verify: founder without code" "VerifyAddressMismatch\\(\"recipients.founder\"" \
  forge_verify "$REHEARSAL/founder-eoa.json" "$SAFE_DEPLOYMENT"

log "Safe creation script and config builder (the Base Sepolia pipeline, on Anvil)"
PIPE_SAFES="deploy/deployments/31337-created-safes.json"
PIPE_CONFIG="$REHEARSAL/created-safes-config.json"
PIPE_PLAN="$REHEARSAL/created-safes-plan.json"
PIPE_DEPLOYMENT="deploy/deployments/31337-created-safes-deployment.json"
create_safes() {
  ARL_SAFE_FACTORY="$SAFE_FACTORY" ARL_SAFE_SINGLETON="$SAFE_SINGLETON" \
    ARL_SAFE_OWNERS="$(account 2),$(account 3),$(account 4)" ARL_SAFE_THRESHOLD=2 \
    ARL_GUARDIAN_OWNERS="$1" ARL_GUARDIAN_THRESHOLD="$2" ARL_SALT="$3" ARL_SAFES_OUT="$4" \
    forge script script/CreateSafes.s.sol:CreateSafes \
    --rpc-url "$RPC" --broadcast --unlocked --sender "$SAFE_DEPLOYER" --slow
}
BEFORE_SAFES="$(cast nonce "$SAFE_DEPLOYER" --rpc-url "$RPC")"
must_fail "guardian signers overlap the other Safes" "guardian signers overlap" \
  create_safes "$(account 4),$(account 6)" 1 overlap "$REHEARSAL/x.json"
[[ "$(cast nonce "$SAFE_DEPLOYER" --rpc-url "$RPC")" == "$BEFORE_SAFES" ]] || die "a rejected Safe creation broadcast a transaction"
create_safes "$(account 6),$(account 7)" 2 pipeline "$PIPE_SAFES" >/dev/null || die "Safe creation failed"
safeval() { node -e "console.log(require('./$PIPE_SAFES').safes.$1)"; }
expect "created founder safe is a Safe v1.5.0 proxy" "$(canonical_hash SAFE_PROXY_V150_CODEHASH)" \
  "$(cast codehash "$(safeval founder)" --rpc-url "$RPC")"
expect "created treasury safe threshold" "2" "$(num "$(safeval treasury)" 'getThreshold()(uint256)')"
expect "created guardian safe owners" "[$(account 6), $(account 7)]" \
  "$(cast call "$(safeval guardian)" 'getOwners()(address[])' --rpc-url "$RPC" | tr 'A-F' 'a-f')"
expect "created safes are distinct" "12" \
  "$(node -e "console.log(new Set(Object.values(require('./$PIPE_SAFES').safes).map(a=>a.toLowerCase())).size)")"
node "$ROOT/packages/deploy/src/safes-config-cli.ts" "$PIPE_SAFES" 2027-01-01T00:00:00Z "$PIPE_CONFIG" \
  || die "config from created Safes rejected"
node "$ROOT/packages/deploy/src/cli.ts" "$PIPE_CONFIG" "$PIPE_PLAN" || die "planner rejected the created-Safes config"
forge_deploy "$PIPE_PLAN" "$PIPE_DEPLOYMENT" >/dev/null || die "deployment with created Safes failed"
forge_verify "$PIPE_PLAN" "$PIPE_DEPLOYMENT" || die "verifier rejected the deployment with created Safes"
expect "created founder safe balance" "2100000000000000000000000" \
  "$(num "$(node -e "console.log(require('./$PIPE_DEPLOYMENT').token)")" 'balanceOf(address)(uint256)' "$(safeval founder)")"
node -e "const s=require('./$PIPE_SAFES'); s.chainId=8453; require('fs').writeFileSync('$REHEARSAL/mainnet-safes.json', JSON.stringify(s));"
must_fail "config builder: Base Mainnet Safes" "Base Mainnet\\) is locked" \
  node "$ROOT/packages/deploy/src/safes-config-cli.ts" "$REHEARSAL/mainnet-safes.json" 2027-01-01T00:00:00Z "$REHEARSAL/x.json"

log "Circulating supply moves only when tokens leave a locked address"
# Runs last: it moves genesis tokens, after which the verifier's genesis checks no longer apply.
BEEF=0x000000000000000000000000000000000000bEEF
impersonate() {
  cast rpc anvil_impersonateAccount "$1" --rpc-url "$RPC" >/dev/null
  cast rpc anvil_setBalance "$1" 0xDE0B6B3A7640000 --rpc-url "$RPC" >/dev/null
}
send_from() {
  cast send "$TOKEN" 'transfer(address,uint256)' "$2" "$3" --unlocked --from "$1" --rpc-url "$RPC" >/dev/null
}
FOUNDER_U="$(planval recipients.founder)"
LIQUIDITY="$(planval recipients.liquidity)"
impersonate "$FOUNDER_U"
send_from "$FOUNDER_U" "$BEEF" 500000000000000000000000
expect "circulating after a founder sale" "2100000000000000000000000" "$(supply circulatingSupply)"
impersonate "$LIQUIDITY"
send_from "$LIQUIDITY" "$BEEF" 1
expect "circulating after 1 unit leaves liquidity" "2100000000000000000000001" "$(supply circulatingSupply)"

log "Public Launch Merkle claim distributor (economic specification section 7)"
# The claim list is the placeholder fixture the contract tests use; nobody holds its keys.
LIST="$REHEARSAL/distribution.json"
node "$ROOT/packages/deploy/src/distribution-cli.ts" test/fixtures/distribution-input.json "$LIST" \
  || die "claim list rejected"
DISTRIBUTOR_RECORD="deploy/deployments/31337-distributor.json"
NOW="$(cast block latest --field timestamp --rpc-url "$RPC")"
CLAIM_END=$((NOW + 30 * 86400))
forge_distributor() {
  ARL_PLAN="$PLAN" ARL_DEPLOYMENT="$DEPLOYMENT" ARL_DISTRIBUTION="$1" ARL_CLAIM_END="$CLAIM_END" \
    ARL_DISTRIBUTOR="$2" forge script script/DeployDistributor.s.sol:DeployDistributor \
    --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER" --slow
}
listval() { node -e "console.log(require('./$LIST').$1)"; }
node -e "const l=require('./$LIST'); l.allocation='liquidity'; require('fs').writeFileSync('$REHEARSAL/list-liquidity.json', JSON.stringify(l));"
BEFORE="$(nonce)"
must_fail "distributor funded by another allocation" "DistributorWrongAllocation\\(\"liquidity\"" \
  forge_distributor "$REHEARSAL/list-liquidity.json" "$REHEARSAL/x.json"
[[ "$(nonce)" == "$BEFORE" ]] || die "a rejected distributor deployment broadcast a transaction"
forge_distributor "$LIST" "$DISTRIBUTOR_RECORD" >/dev/null || die "distributor deployment failed"
DISTRIBUTOR="$(node -e "console.log(require('./$DISTRIBUTOR_RECORD').distributor)")"
LAUNCH="$(planval recipients.publicLaunch)"
TOTAL="$(listval total)"
expect "distributor merkle root" "$(listval merkleRoot)" "$(cast call "$DISTRIBUTOR" 'merkleRoot()(bytes32)' --rpc-url "$RPC")"
expect "distributor returns remainder to" "$(cast to-check-sum-address "$LAUNCH")" \
  "$(cast call "$DISTRIBUTOR" 'returnTo()(address)' --rpc-url "$RPC")"
expect "distributor claim end" "$CLAIM_END" "$(num "$DISTRIBUTOR" 'claimEnd()(uint64)')"
impersonate "$LAUNCH"
send_from "$LAUNCH" "$DISTRIBUTOR" "$TOTAL"
node "$ROOT/packages/deploy/src/manifest-cli.ts" "$PLAN" "$DEPLOYMENT" "$MANIFEST" "$DISTRIBUTOR_RECORD" \
  || die "manifest with distributor failed"
expect "circulating after funding the distributor" "2100000000000000000000001" "$(supply circulatingSupply)"
CLAIMANT="$(node -e "console.log(Object.keys(require('./$LIST').claims)[4])")"
claim() {
  local c
  c="$(node -e "const x=require('./$LIST').claims['$CLAIMANT']; console.log([x.index, x.amount, '['+x.proof.join(',')+']'].join(' '))")"
  # shellcheck disable=SC2086
  cast send "$DISTRIBUTOR" 'claim(uint256,address,uint256,bytes32[])' $(cut -d' ' -f1 <<<"$c") \
    "$CLAIMANT" $(cut -d' ' -f2 <<<"$c") $(cut -d' ' -f3 <<<"$c") \
    --unlocked --from "$DEPLOYER" --rpc-url "$RPC"
}
claim >/dev/null || die "claim failed"
CLAIMED="$(listval "claims['$CLAIMANT'].amount")"
expect "claimant balance" "$CLAIMED" "$(balance "$CLAIMANT")"
expect "circulating after one claim" "$(node -e "console.log((2100000000000000000000001n + ${CLAIMED}n).toString())")" \
  "$(supply circulatingSupply)"
# The RPC reports the custom error by selector: DistributorAlreadyClaimed(uint256).
must_fail "claim twice" "$(cast sig 'DistributorAlreadyClaimed(uint256)')" claim
cast rpc evm_increaseTime $((30 * 86400)) --rpc-url "$RPC" >/dev/null
cast rpc evm_mine --rpc-url "$RPC" >/dev/null
LAUNCH_BEFORE="$(balance "$LAUNCH")"
cast send "$DISTRIBUTOR" 'sweep()' --unlocked --from "$DEPLOYER" --rpc-url "$RPC" >/dev/null || die "sweep failed"
expect "distributor empty after sweep" "0" "$(balance "$DISTRIBUTOR")"
expect "remainder returned to the Public Launch Safe" \
  "$(node -e "console.log((${LAUNCH_BEFORE}n + ${TOTAL}n - ${CLAIMED}n).toString())")" "$(balance "$LAUNCH")"
expect "circulating after sweep" "$(node -e "console.log((2100000000000000000000001n + ${CLAIMED}n).toString())")" \
  "$(supply circulatingSupply)"

log "Monitor: read-only health check of the live deployment"
monitor() { node "$ROOT/packages/deploy/src/monitor-cli.ts" "$1" "$DEPLOYMENT" "$RPC" 0; }
report() { monitor "$PLAN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).$1))"; }
# Tokens have moved (founder sale, claims), which the genesis verifier would refuse; the monitor
# checks the rules that hold for the life of the deployment.
monitor "$PLAN" >/dev/null || die "monitor reported a healthy deployment as unhealthy"
expect "monitor findings on a healthy deployment" "" "$(report "findings.map(f=>f.check+': '+f.detail).join('; ')")"
TREASURY_SAFE="$(planval treasury.safe)"
DELAY="$(planval treasury.minDelay)"
impersonate "$TREASURY_SAFE"
cast send "$TIMELOCK" 'schedule(address,uint256,bytes,bytes32,bytes32,uint256)' "$TOKEN" 0 \
  "$(cast calldata 'transfer(address,uint256)' "$BEEF" 1)" "$(cast to-uint256 0)" "$(cast to-uint256 0)" \
  "$DELAY" --unlocked --from "$TREASURY_SAFE" --rpc-url "$RPC" >/dev/null || die "schedule failed"
expect "monitor sees the scheduled treasury transfer" "timelock operation waiting" "$(report 'findings[0].check')"
expect "a pending operation is a notice, not a failure" "true" "$(report healthy)"
cast rpc evm_increaseTime "$DELAY" --rpc-url "$RPC" >/dev/null
cast rpc evm_mine --rpc-url "$RPC" >/dev/null
expect "monitor sees the operation ready after 48 hours" "timelock operation ready to execute" \
  "$(report 'findings[0].check')"
# A plan that disagrees with the chain (another guardian) is a critical finding: exit code 3.
mutate "$REHEARSAL/other-guardian.json" "p.treasury.guardian = '$BEEF'"
set +e
monitor "$REHEARSAL/other-guardian.json" >/dev/null
CODE=$?
set -e
expect "monitor exit code on a critical finding" "3" "$CODE"
NEGATIVE=$((NEGATIVE + 1))

log "Network gate on separate chains: Base Mainnet (8453) locked, Base Sepolia (84532) open"
# Each chain is a fresh local Anvil with that chain ID; nothing touches a real network.
gate_chain() {
  anvil --port "$2" --chain-id "$1" --silent &
  GATE_PIDS+=($!)
  for _ in $(seq 1 50); do
    if cast chain-id --rpc-url "http://127.0.0.1:$2" >/dev/null 2>&1; then break; fi
    sleep 0.2
  done
  [[ "$(cast chain-id --rpc-url "http://127.0.0.1:$2")" == "$1" ]] || die "gate chain $1 did not start"
}
gate_deploy() {
  ARL_PLAN="$2" ARL_DEPLOYMENT="$REHEARSAL/x.json" forge script script/DeployARL.s.sol:DeployARL \
    --rpc-url "http://127.0.0.1:$1" --broadcast --unlocked --sender "$DEPLOYER" --slow
}
MAINNET_PORT=$((PORT + 1))
TESTNET_PORT=$((PORT + 2))
gate_chain 8453 "$MAINNET_PORT"
gate_chain 84532 "$TESTNET_PORT"
# A Base Mainnet plan that sets every field a real one would (code checks, canonical singletons).
mutate "$REHEARSAL/mainnet.json" "p.chainId = 8453; p.network = 'base'; p.requireRecipientCode = true; p.safe.singletons = ['0xFf51A5898e281Db6DfC7855790607438dF2ca44b', '0xEdd160fEBBD92E350D4D398fb636302fccd67C7e']"
must_fail "DeployARL on Base Mainnet" "PlanProductionLocked\\(8453\\)" gate_deploy "$MAINNET_PORT" "$REHEARSAL/mainnet.json"
must_fail "DeployARL on Base Mainnet with the local plan" "PlanProductionLocked\\(8453\\)" gate_deploy "$MAINNET_PORT" "$PLAN"
must_fail "DeployDistributor on Base Mainnet" "PlanProductionLocked\\(8453\\)" env \
  ARL_PLAN="$REHEARSAL/mainnet.json" ARL_DEPLOYMENT="$DEPLOYMENT" ARL_DISTRIBUTION="$LIST" \
  ARL_CLAIM_END="$CLAIM_END" ARL_DISTRIBUTOR="$REHEARSAL/x.json" \
  forge script script/DeployDistributor.s.sol:DeployDistributor \
  --rpc-url "http://127.0.0.1:$MAINNET_PORT" --broadcast --unlocked --sender "$DEPLOYER" --slow
expect "no transaction on the Base Mainnet chain" "0" \
  "$(cast nonce "$DEPLOYER" --rpc-url "http://127.0.0.1:$MAINNET_PORT")"
# A Base Sepolia plan from the planner passes the network gate and is then held to the Safe
# rules: the placeholder recipients have no code, so it stops there, before broadcasting.
bad_config "$REHEARSAL/cfg-testnet.json" "c.chainId = 84532; c.network = 'base-sepolia'; c.requireRecipientCode = true"
planner "$REHEARSAL/cfg-testnet.json" >/dev/null || die "planner rejected a Base Sepolia config"
cp "$REHEARSAL/p.json" "$REHEARSAL/testnet.json"
expect "Base Sepolia plan chain" "84532" "$(node -e "console.log(require('./$REHEARSAL/testnet.json').chainId)")"
must_fail "Base Sepolia passes the gate, then needs Safes" "PlanRecipientHasNoCode" \
  gate_deploy "$TESTNET_PORT" "$REHEARSAL/testnet.json"
expect "no transaction on the Base Sepolia chain" "0" \
  "$(cast nonce "$DEPLOYER" --rpc-url "http://127.0.0.1:$TESTNET_PORT")"

log "REHEARSAL PASSED: deployed, verified, and $NEGATIVE negative cases rejected"
