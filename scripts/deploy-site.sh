#!/usr/bin/env bash
# Builds arlcoin.io as a static export and deploys it to Vercel production, with the supply API
# (apps/web/api), the headers in apps/web/vercel.json and the app (apps/dapp) under /app; the build
# is scripts/build-site.sh. Run from the repository root by someone
# logged in to the Vercel CLI for the `alazdg` scope, after linking the repository once with
# `npx vercel link --scope alazdg --project arlcoin` (writes the gitignored .vercel/). Nothing
# from .env files is uploaded. In CI (.github/workflows/deploy-site.yml) the CLI authenticates
# with VERCEL_TOKEN instead of a login.
#
#   bash scripts/deploy-site.sh            # build and deploy
#   node scripts/indexnow.mjs              # then tell IndexNow search engines
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'cd "$ROOT"; rm -rf "$STAGE" 2>/dev/null || true' EXIT

bash "$ROOT/scripts/build-site.sh" "$STAGE"
cp -r "$ROOT/.vercel" "$STAGE/.vercel" 2>/dev/null || true

cd "$STAGE"
TOKEN_ARGS=()
if [ -n "${VERCEL_TOKEN:-}" ]; then TOKEN_ARGS=(--token "$VERCEL_TOKEN"); fi
npx --yes vercel@latest deploy --prod --yes --scope alazdg ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"}
