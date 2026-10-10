#!/usr/bin/env bash
# Builds the ARL app (apps/dapp) for Base Sepolia and deploys it to Vercel production (the
# `arl-app` project of the `alazdg` team), with the testnet operator's API. Run from the
# repository root after `npm ci` at the root and in apps/dapp. The operator key is passed to the
# deployment's runtime from ARL_OPERATOR_KEY and is never written to a file or printed; without
# it the app works but the faucet, group joins, relayed votes and settlements answer 503.
#
#   VERCEL_TOKEN=… [VERCEL_ORG_ID=… VERCEL_PROJECT_ID=…] ARL_OPERATOR_KEY=… bash scripts/deploy-app.sh
#
# Without VERCEL_PROJECT_ID the project is linked (and created on first use) by name.
# Verified offline: `vercel build` from the repository root with these settings produces the
# pages and the api/operator function.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERCEL=(npx --yes vercel@63.1.2)
SCOPE=(--scope alazdg)
TOKEN_ARGS=()
if [ -n "${VERCEL_TOKEN:-}" ]; then TOKEN_ARGS=(--token "$VERCEL_TOKEN"); fi

cd "$ROOT"
# The app can only be built for Base Sepolia once the ecosystem is recorded.
[ -f contracts/deploy/base-sepolia.json ] || { echo "no contracts/deploy/base-sepolia.json" >&2; exit 1; }
grep -q "84532" apps/dapp/contracts/baseSepoliaContracts.ts ||
  { echo "apps/dapp/contracts/baseSepoliaContracts.ts is empty" >&2; exit 1; }

# Linked at the repository root, with apps/dapp as the root directory: the app imports
# packages/ from outside its folder, and Next traces files from the repository root.
rm -rf .vercel
if [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
  ORG="$VERCEL_ORG_ID"
  PROJECT="$VERCEL_PROJECT_ID"
else
  "${VERCEL[@]}" link --yes --project arl-app "${SCOPE[@]}" ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"}
  ORG="$(node -e "console.log(require('./.vercel/project.json').orgId)")"
  PROJECT="$(node -e "console.log(require('./.vercel/project.json').projectId)")"
fi
# Build settings are fixed here, not pulled: no environment values reach the build.
mkdir -p .vercel
printf '{"orgId":"%s","projectId":"%s","settings":{"framework":"nextjs","installCommand":null,"buildCommand":null,"outputDirectory":null,"rootDirectory":"apps/dapp","nodeVersion":"22.x"}}\n' \
  "$ORG" "$PROJECT" >.vercel/project.json

NEXT_PUBLIC_ARL_CHAIN=84532 "${VERCEL[@]}" build --prod --yes "${SCOPE[@]}" ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"}
if find .vercel/output -name '.env*' | grep -q .; then
  echo "refusing to deploy: an .env file is in the output" >&2
  exit 1
fi

ENV_ARGS=(--env NEXT_PUBLIC_ARL_CHAIN=84532)
if [ -n "${ARL_OPERATOR_KEY:-}" ]; then ENV_ARGS+=(--env "ARL_OPERATOR_KEY=$ARL_OPERATOR_KEY"); fi
"${VERCEL[@]}" deploy --prebuilt --prod --yes "${ENV_ARGS[@]}" "${SCOPE[@]}" ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"}
