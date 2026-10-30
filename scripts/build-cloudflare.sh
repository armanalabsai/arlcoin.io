#!/usr/bin/env bash
# Builds what arlcoin.io serves, laid out for Cloudflare Pages: the same build as Vercel
# (scripts/build-site.sh: website, app under /app), with apps/web/vercel.json translated into
# _headers and _redirects, and /api/supply as a Pages Function. Vercel Web Analytics is left out,
# since its script is served only by Vercel.
#
#   bash scripts/build-cloudflare.sh <stage-dir>
#   cd <stage-dir> && npx wrangler pages deploy public --project-name arlcoin
#
# Layout of <stage-dir>: public/ (static files), functions/api/supply/index.js, lib/ (the shared
# supply code and its configuration). wrangler must run from <stage-dir> to find functions/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${1:?usage: build-cloudflare.sh <stage-dir>}"
mkdir -p "$STAGE"
STAGE="$(cd "$STAGE" && pwd)"
for d in public functions lib; do
  if [ -e "$STAGE/$d" ]; then
    echo "refusing to build: $STAGE/$d already exists" >&2
    exit 1
  fi
done

VERCEL_STAGE="$(mktemp -d)"
trap 'rm -rf "$VERCEL_STAGE"' EXIT
NEXT_PUBLIC_ARL_ANALYTICS=0 bash "$ROOT/scripts/build-site.sh" "$VERCEL_STAGE"

mkdir -p "$STAGE/public" "$STAGE/functions/api/supply" "$STAGE/lib"
cp -r "$VERCEL_STAGE/apps/web/." "$STAGE/public/"
rm -rf "$STAGE/public/api" "$STAGE/public/vercel.json"
node "$ROOT/scripts/cloudflare/vercel-to-pages.mjs" "$ROOT/apps/web/vercel.json" "$STAGE/public"
# Only /api/* runs the Function; every other request is a static file and costs no invocation.
printf '{"version":1,"include":["/api/*"],"exclude":[]}\n' > "$STAGE/public/_routes.json"

cp "$ROOT/scripts/cloudflare/supply-function.mjs" "$STAGE/functions/api/supply/index.js"
cp "$ROOT/apps/web/api/_supply-core.mjs" "$STAGE/lib/_supply-core.mjs"
if [ -f "$ROOT/apps/web/api/supply-config.json" ]; then
  cp "$ROOT/apps/web/api/supply-config.json" "$STAGE/lib/supply-config.json"
else
  echo null > "$STAGE/lib/supply-config.json"
fi
echo "site staged in $STAGE (deploy public/ from $STAGE)"
