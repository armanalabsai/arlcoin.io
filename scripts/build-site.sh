#!/usr/bin/env bash
# Builds what arlcoin.io serves into a staging directory laid out for Vercel (project root
# apps/web): the website as a static export, the supply API (apps/web/api), apps/web/vercel.json,
# and the app (apps/dapp) as a static export under /app, as the Pages workflow does. Used by
# scripts/deploy-site.sh and by the app's hosted test (apps/dapp, npm run test:hosted).
#
# Trade is open: NEXT_PUBLIC_ARL_MAINNET_TOKEN is the Base Mainnet token (deployed and verified
# 2026-10-24). Claim stays closed: no claim list is published (apps/dapp/public/claims/8453.json).
#
#   bash scripts/build-site.sh <stage-dir>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${1:?usage: build-site.sh <stage-dir>}"
mkdir -p "$STAGE"
STAGE="$(cd "$STAGE" && pwd)"
if [ -e "$STAGE/apps" ]; then
  echo "refusing to build: $STAGE/apps already exists" >&2
  exit 1
fi

cd "$ROOT/apps/web"
rm -rf out .next
ARL_STATIC_EXPORT=1 NEXT_PUBLIC_ARL_ANALYTICS=1 npm run build

# The app: @arl/zk (packages/zk) is linked into it and its dependencies install at the root.
cd "$ROOT/apps/dapp"
rm -rf out .next
# Git Bash on Windows would rewrite "/app" into a Windows path; the exclusion keeps it as is.
# The public app targets Base Sepolia once the ecosystem is recorded (contracts/deploy/
# base-sepolia.json); its testnet operator API is served by the server-hosted app
# (app.arlcoin.io, scripts/deploy-app.sh), which a static export cannot serve itself.
CHAIN_ENV=()
if grep -q 84532 contracts/baseSepoliaContracts.ts; then
  CHAIN_ENV=(NEXT_PUBLIC_ARL_CHAIN=84532 "NEXT_PUBLIC_ARL_OPERATOR_URL=${ARL_OPERATOR_URL:-https://app.arlcoin.io}")
fi
CHAIN_ENV+=(NEXT_PUBLIC_ARL_MAINNET_TOKEN=0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4)
env ${CHAIN_ENV[@]+"${CHAIN_ENV[@]}"} MSYS2_ENV_CONV_EXCL=ARL_BASE_PATH ARL_STATIC_EXPORT=1 ARL_BASE_PATH=/app npm run build

# Vercel's project root directory is apps/web.
mkdir -p "$STAGE/apps/web"
cp -r "$ROOT/apps/web/out/." "$STAGE/apps/web/"
cp -r "$ROOT/apps/dapp/out" "$STAGE/apps/web/app"
cp -r "$ROOT/apps/web/api" "$STAGE/apps/web/api"
cp "$ROOT/apps/web/vercel.json" "$STAGE/apps/web/vercel.json"
if find "$STAGE/apps/web" -name '.env*' | grep -q .; then
  echo "refusing to build: an .env file is in the output" >&2
  exit 1
fi
echo "site staged in $STAGE/apps/web (app under /app)"
