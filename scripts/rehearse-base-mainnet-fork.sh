#!/usr/bin/env bash
# Full TGE-day rehearsal on a LOCAL fork of Base Mainnet, with the real signer configuration.
#
# Anvil forks Base Mainnet (chain 8453) on this machine; nothing is sent to Base Mainnet. The
# fork's clock is moved to just after the TGE (2026-11-01T00:00:00Z), when the network gate opens.
# The real deployer, Safe owners and guardian come from contracts/deploy/deployments/
# 8453-signers.env (public addresses, git-ignored); Anvil impersonates them, so no key is used.
# The deployer is given exactly 0.001 ETH, the amount the runbook asks for.
#
# Steps, as in docs/mainnet-runbook.md:
#   0. before the TGE every deployment path is refused (PlanProductionLocked)
#   1. CreateSafes: the 12 Safes, compared with docs/mainnet-plan.md
#   2. config (TGE 2026-11-01), plan, DeployARL, VerifyARL, manifest, supply (2,100,000 circulating)
#   3. the four ARL-only Uniswap v3 pools from the Liquidity Safe (1,000,000 ARL)
#   4. the Public Launch claim distributor, funded by the Public Launch Safe
#
# Needs outbound HTTPS to the RPC. Not part of CI.
# Usage: scripts/rehearse-base-mainnet-fork.sh [fork-rpc-url]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORK_URL="${1:-https://mainnet.base.org}"
PORT="${ARL_FORK_PORT:-18745}"
RPC="http://127.0.0.1:$PORT"
OUT="deploy/deployments/fork-8453"
SIGNERS="$ROOT/contracts/deploy/deployments/8453-signers.env"
TGE=1793491200

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\nMAINNET FORK REHEARSAL FAILED: %s\n' "$*" >&2
  exit 1
}
cleanup() { if [[ -n "${ANVIL_PID:-}" ]]; then kill "$ANVIL_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

[[ -f "$SIGNERS" ]] || die "missing $SIGNERS"
# shellcheck disable=SC1090
source "$SIGNERS"
[[ "$(cast chain-id --rpc-url "$FORK_URL")" == "8453" ]] || die "$FORK_URL is not Base Mainnet"
[[ "$(cast nonce "$ARL_DEPLOYER" --rpc-url "$FORK_URL")" == "0" ]] ||
  die "the deployer has sent a transaction on Base Mainnet; every planned address has changed"
if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then die "port $PORT is in use"; fi

log "Forking Base Mainnet locally on port $PORT"
anvil --port "$PORT" --fork-url "$FORK_URL" --auto-impersonate --silent &
ANVIL_PID=$!
for _ in $(seq 1 100); do
  if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
[[ "$(cast chain-id --rpc-url "$RPC")" == "8453" ]] || die "fork did not start as chain 8453"
cast rpc anvil_setBalance "$ARL_DEPLOYER" "$(cast to-hex 1000000000000000)" --rpc-url "$RPC" >/dev/null

cd "$ROOT/contracts"
rm -rf "$OUT"
mkdir -p "$OUT"
# No deploy script writes a record. Every record comes from the verified-record tool, which
# checks each created contract on chain first; on a fork it needs --local-anvil and stamps the
# record base-mainnet-fork-rehearsal, so it can never pass for a Base Mainnet record.
RECORD="$ROOT/packages/deploy/src/record-cli.ts"
record() {
  node "$RECORD" "$1" "broadcast/$2/8453/run-latest.json" "$RPC" "$3" --local-anvil "${@:4}" \
    >"$OUT/record-$1.log" 2>&1 || die "$1 record not verified (see contracts/$OUT/record-$1.log)"
  [[ "$(node -e "console.log(require('./$3').verified.network)")" == "base-mainnet-fork-rehearsal" ]] ||
    die "$1 record is not stamped as a fork rehearsal"
}
safes() {
  ARL_SAFE_OWNERS="$ARL_SAFE_OWNERS" ARL_SAFE_THRESHOLD="$ARL_SAFE_THRESHOLD" \
    ARL_GUARDIAN_OWNERS="$ARL_GUARDIAN_OWNERS" ARL_GUARDIAN_THRESHOLD="$ARL_GUARDIAN_THRESHOLD" \
    forge script script/CreateSafes.s.sol:CreateSafes \
    --rpc-url "$RPC" --broadcast --unlocked --sender "$ARL_DEPLOYER" --slow
}

log "Before the TGE: Base Mainnet is refused"
NOW="$(cast block latest --field timestamp --rpc-url "$RPC")"
if ((NOW < TGE)); then
  if safes >"$OUT/pre-tge.log" 2>&1; then die "CreateSafes ran before the TGE"; fi
  grep -q "PlanProductionLocked(8453)" "$OUT/pre-tge.log" || die "refused for another reason"
  [[ "$(cast nonce "$ARL_DEPLOYER" --rpc-url "$RPC")" == "0" ]] || die "a refused run sent a transaction"
  echo "refused with PlanProductionLocked(8453); deployer nonce still 0"
fi

log "Moving the fork's clock to the TGE"
cast rpc evm_setNextBlockTimestamp "$((TGE + 60))" --rpc-url "$RPC" >/dev/null
cast rpc evm_mine --rpc-url "$RPC" >/dev/null
echo "block time $(cast block latest --field timestamp --rpc-url "$RPC") (TGE $TGE)"

log "1. CreateSafes with the real owners"
safes >"$OUT/safes.log" 2>&1 || die "CreateSafes failed (see contracts/$OUT/safes.log)"
if node "$RECORD" safes broadcast/CreateSafes.s.sol/8453/run-latest.json "$RPC" "$OUT/x.json" >/dev/null 2>&1; then
  die "the record tool accepted an Anvil fork as Base Mainnet"
fi
record safes CreateSafes.s.sol "$OUT/safes.json"
node - "$OUT/safes.json" "$ROOT/docs/mainnet-plan.md" <<'EOF' || die "Safe addresses differ from docs/mainnet-plan.md"
const fs = require("fs");
const safes = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).safes;
const doc = fs.readFileSync(process.argv[3], "utf8");
const expected = Object.fromEntries(
  [...doc.matchAll(/\| ([A-Za-z &]+ Safe) +\| `(0x[0-9a-fA-F]{40})` \|/g)].map((m) => [m[1].trim(), m[2]]),
);
const found = Object.values(safes).map((a) => a.toLowerCase());
let bad = 0;
for (const [name, addr] of Object.entries(expected)) {
  const ok = found.includes(addr.toLowerCase());
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "DIFF"} ${name.padEnd(30)} ${addr}`);
}
if (Object.keys(expected).length !== 12 || bad) process.exit(1);
EOF

log "2. Config (TGE 2026-11-01), plan, DeployARL, VerifyARL, manifest, supply"
# The planner checks the machine clock against the TGE; set it to the fork's time for the rehearsal.
CLOCK_URL="file://$(command -v cygpath >/dev/null && echo "/$(cygpath -m "$ROOT")" || echo "$ROOT")/scripts/rehearsal-clock.mjs"
CLOCK=(env ARL_REHEARSAL_CLOCK="$((TGE + 60))" node --import "$CLOCK_URL")
"${CLOCK[@]}" "$ROOT/packages/deploy/src/safes-config-cli.ts" "$OUT/safes.json" 2026-11-01T00:00:00Z \
  "$OUT/config.json" || die "config rejected"
"${CLOCK[@]}" "$ROOT/packages/deploy/src/cli.ts" "$OUT/config.json" "$OUT/plan.json" || die "plan rejected"
ARL_PLAN="$OUT/plan.json" \
  forge script script/DeployARL.s.sol:DeployARL \
  --rpc-url "$RPC" --broadcast --unlocked --sender "$ARL_DEPLOYER" --slow >"$OUT/deploy.log" 2>&1 ||
  die "DeployARL failed (see contracts/$OUT/deploy.log)"
record arl DeployARL.s.sol "$OUT/deployment.json"
ARL_PLAN="$OUT/plan.json" ARL_DEPLOYMENT="$OUT/deployment.json" \
  forge script script/VerifyARL.s.sol:VerifyARL --rpc-url "$RPC" -q || die "VerifyARL failed"
node "$ROOT/packages/deploy/src/manifest-cli.ts" "$OUT/plan.json" "$OUT/deployment.json" \
  "$OUT/manifest.json" >/dev/null || die "manifest failed"
TOKEN="$(node -e "console.log(require('./$OUT/deployment.json').token)")"
EXPECTED_TOKEN="$(grep -oE '\| ARL token +\| `0x[0-9a-fA-F]{40}`' "$ROOT/docs/mainnet-plan.md" | grep -oE '0x[0-9a-fA-F]{40}')"
[[ "${TOKEN,,}" == "${EXPECTED_TOKEN,,}" ]] || die "token at $TOKEN, plan says $EXPECTED_TOKEN"
echo "ARL token $TOKEN (as planned)"
SUPPLY="$(node "$ROOT/packages/deploy/src/supply-cli.ts" "$OUT/manifest.json" "$RPC")"
node -e "const s=JSON.parse(process.argv[1]); console.log('total', s.totalSupplyArl, 'circulating', s.circulatingSupplyArl); if (s.totalSupplyArl !== '21000000' || s.circulatingSupplyArl !== '2100000') process.exit(1)" "$SUPPLY" ||
  die "supply at TGE is not 21,000,000 total and 2,100,000 circulating"
LEFT="$(cast balance "$ARL_DEPLOYER" --rpc-url "$RPC" -e)"
echo "deployer ETH left of the 0.001 ETH: $LEFT"

log "3. Four ARL-only Uniswap v3 pools from the Liquidity Safe (1,000,000 ARL)"
LIQUIDITY="$(node -e "const s=require('./$OUT/safes.json').safes; console.log(s.liquidity)")"
ETH_USD="$(cast call 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70 'latestAnswer()(int256)' --rpc-url "$RPC" | cut -d' ' -f1)"
BTC_USD="$(cast call 0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F 'latestAnswer()(int256)' --rpc-url "$RPC" | cut -d' ' -f1)"
node - "$OUT/pools.json" "$TOKEN" "$LIQUIDITY" "$ETH_USD" "$BTC_USD" <<'EOF'
const [out, token, liquiditySafe, eth, btc] = process.argv.slice(2);
const usd = (x) => (Number(x) / 1e8).toFixed(2); // Chainlink feeds: 8 decimals
require("fs").writeFileSync(out, JSON.stringify({
  token, liquiditySafe, priceUsd: "0.20", deadline: 1793491200 + 30 * 86400,
  legs: [
    { quote: "USDC", arlAmount: "400000", quoteUsd: "1" },
    { quote: "USDT", arlAmount: "200000", quoteUsd: "1" },
    { quote: "WETH", arlAmount: "300000", quoteUsd: usd(eth) },
    { quote: "cbBTC", arlAmount: "100000", quoteUsd: usd(btc) },
  ],
}, null, 2));
console.log(`ETH ${usd(eth)} USD, BTC ${usd(btc)} USD (Chainlink on the fork)`);
EOF
node "$ROOT/packages/deploy/src/pool-cli.ts" "$OUT/pools.json" "$OUT/pool.json" || die "pool batch rejected"
cast rpc anvil_setBalance "$LIQUIDITY" "$(cast to-hex 100000000000000000)" --rpc-url "$RPC" >/dev/null
node -e "for (const t of require('./$OUT/pool.json').transactions) console.log(t.to, t.data)" |
  while read -r TO DATA; do
    cast send "$TO" "$DATA" --from "$LIQUIDITY" --unlocked --rpc-url "$RPC" >/dev/null ||
      die "pool transaction to $TO failed"
  done
INPOOLS=0
for Q in 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2 \
  0x4200000000000000000000000000000000000006 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf; do
  POOL="$(cast call 0x33128a8fC17869897dcE68Ed026d694621f6FDfD 'getPool(address,address,uint24)(address)' "$TOKEN" "$Q" 10000 --rpc-url "$RPC")"
  BAL="$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$POOL" --rpc-url "$RPC" | cut -d' ' -f1)"
  echo "pool $POOL holds $(cast from-wei "$BAL") ARL"
  INPOOLS="$(node -e "console.log((BigInt('$INPOOLS') + BigInt('$BAL')).toString())")"
done
node -e "const d=1000000n*10n**18n-BigInt('$INPOOLS'); if (d < 0n || d > 10n**12n) process.exit(1)" ||
  die "the pools do not hold 1,000,000 ARL"
[[ "$(cast call 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1 'balanceOf(address)(uint256)' "$LIQUIDITY" --rpc-url "$RPC")" == "4" ]] ||
  die "the Liquidity Safe does not hold the four position NFTs"

log "4. Public Launch claim distributor (placeholder list), funded by the Public Launch Safe"
CLAIM_END=$((TGE + 60 + 59 * 86400))
ARL_PLAN="$OUT/plan.json" ARL_DEPLOYMENT="$OUT/deployment.json" \
  ARL_DISTRIBUTION=test/fixtures/distribution.json ARL_CLAIM_END="$CLAIM_END" \
  forge script script/DeployDistributor.s.sol:DeployDistributor \
  --rpc-url "$RPC" --broadcast --unlocked --sender "$ARL_DEPLOYER" --slow >"$OUT/distributor.log" 2>&1 ||
  die "DeployDistributor failed (see contracts/$OUT/distributor.log)"
record distributor DeployDistributor.s.sol "$OUT/distributor.json" --distribution test/fixtures/distribution.json
DISTRIBUTOR="$(node -e "console.log(require('./$OUT/distributor.json').distributor)")"
TOTAL="$(node -e "console.log(require('./test/fixtures/distribution.json').total)")"
PUBLIC="$(node -e "console.log(require('./$OUT/safes.json').safes.publicLaunch)")"
cast rpc anvil_setBalance "$PUBLIC" "$(cast to-hex 100000000000000000)" --rpc-url "$RPC" >/dev/null
cast send "$TOKEN" 'transfer(address,uint256)' "$DISTRIBUTOR" "$TOTAL" --from "$PUBLIC" --unlocked \
  --rpc-url "$RPC" >/dev/null || die "funding the distributor failed"
[[ "$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$DISTRIBUTOR" --rpc-url "$RPC" | cut -d' ' -f1)" == "$TOTAL" ]] ||
  die "the distributor does not hold the list total"
echo "distributor $DISTRIBUTOR holds $(cast from-wei "$TOTAL") ARL until $(date -u -d "@$CLAIM_END" +%F 2>/dev/null || echo "$CLAIM_END")"

log "MAINNET FORK REHEARSAL PASSED; nothing was sent to Base Mainnet"
