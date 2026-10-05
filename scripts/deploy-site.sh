#!/usr/bin/env bash
# Builds arlcoin.io as a static export and deploys it to Vercel production, with the supply API
# (apps/web/api) and the headers in apps/web/vercel.json. Run from the repository root by someone
# logged in to the Vercel CLI for the `alazdg` scope, after linking the repository once with
# `npx vercel link --scope alazdg --project arlcoin` (writes the gitignored .vercel/). Nothing
# from .env files is uploaded.
#
#   bash scripts/deploy-site.sh            # build and deploy
#   node scripts/indexnow.mjs              # then tell IndexNow search engines
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$ROOT/apps/web"
rm -rf out .next
ARL_STATIC_EXPORT=1 NEXT_PUBLIC_ARL_ANALYTICS=1 npm run build

# Vercel's project root directory is apps/web.
mkdir -p "$STAGE/apps/web"
cp -r out/. "$STAGE/apps/web/"
cp -r api "$STAGE/apps/web/api"
cp vercel.json "$STAGE/apps/web/vercel.json"
if ls -a "$STAGE/apps/web" | grep -qE '^\.env'; then
  echo "refusing to deploy: an .env file is in the output" >&2
  exit 1
fi
cp -r "$ROOT/.vercel" "$STAGE/.vercel" 2>/dev/null || true

cd "$STAGE"
npx --yes vercel@latest deploy --prod --yes --scope alazdg
