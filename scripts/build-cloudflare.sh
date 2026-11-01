#!/usr/bin/env bash
# Builds arlcoin.io for Cloudflare Pages into dist/ (wrangler.toml, pages_build_output_dir): the
# website as a static export with the app (apps/dapp) under /app, the response headers and
# redirects (apps/web/public/_headers and _redirects). The API is functions/ at the repository
# root, which Pages builds itself; the testnet operator's handler is bundled first into
# build/operator.mjs for functions/api/operator/[action].js. Cloudflare runs this as the project's build command; it also
# runs locally from the repository root.
#
#   bash scripts/build-cloudflare.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export NEXT_TELEMETRY_DISABLED=1

# Dependencies: the website, the root (the app links @arl/zk from packages/zk) and the app.
[ -d node_modules ] || npm ci
(cd apps/web && npm ci)
(cd apps/dapp && npm ci)

# The testnet operator API (apps/dapp/lib/server/operatorHttp.ts) as one module for the Pages
# Function, built for Base Sepolia like the app. "server-only" is a Next.js guard with no meaning
# outside it.
mkdir -p build
echo 'export {};' > build/empty.mjs
(cd apps/dapp && npx --yes esbuild@0.25.11 lib/server/operatorHttp.ts --bundle --format=esm \
  --platform=neutral --target=es2022 --main-fields=module,main --conditions=worker,browser,import \
  --alias:~~=. --alias:server-only=../../build/empty.mjs --external:node:* --minify \
  --define:process.env.NEXT_PUBLIC_ARL_CHAIN='"84532"' \
  --tsconfig=tsconfig.json --log-level=warning --outfile=../../build/operator.mjs)

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
bash scripts/build-site.sh "$STAGE"

rm -rf dist
mv "$STAGE/apps/web" dist
for f in _headers _redirects index.html app/index.html 404.html; do
  [ -f "dist/$f" ] || { echo "missing dist/$f" >&2; exit 1; }
done
echo "site built in dist/ ($(find dist -type f | wc -l) files)"
