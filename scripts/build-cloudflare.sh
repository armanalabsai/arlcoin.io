#!/usr/bin/env bash
# Builds arlcoin.io for Cloudflare Pages into dist/ (wrangler.toml, pages_build_output_dir): the
# website as a static export with the app (apps/dapp) under /app, the response headers and
# redirects (apps/web/public/_headers and _redirects). The API is functions/ at the repository
# root, which Pages builds itself. Cloudflare runs this as the project's build command; it also
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

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
bash scripts/build-site.sh "$STAGE"

rm -rf dist
mv "$STAGE/apps/web" dist
for f in _headers _redirects index.html app/index.html 404.html; do
  [ -f "dist/$f" ] || { echo "missing dist/$f" >&2; exit 1; }
done
echo "site built in dist/ ($(find dist -type f | wc -l) files)"
