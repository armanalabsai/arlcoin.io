# Hosting arlcoin.io on Cloudflare Pages

## Why

The Vercel team that served arlcoin.io was paused on 2026-09-28 for exceeding the Hobby plan's
fair-use limits. Its one-time 30-day courtesy unblock ran out, and since 2026-10-30 every request
to arlcoin.io, www.arlcoin.io and app.arlcoin.io answers `402 DEPLOYMENT_DISABLED`. Search engines
drop pages that keep failing, so the site moved to Cloudflare Pages: free for static files, with
no bandwidth fair-use pause.

## What is deployed

The Pages project `arlcoin-io` is connected to this repository. Every push builds; `main` is
production and other branches get preview URLs (`<branch>.arlcoin-io.pages.dev`).

| Piece              | Where                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Project settings   | [`wrangler.toml`](../wrangler.toml): output directory `dist`                             |
| Build command      | `bash scripts/build-cloudflare.sh` (installs, runs `scripts/build-site.sh`, writes dist) |
| Website and `/app` | Static exports of `apps/web` and `apps/dapp` (`scripts/build-site.sh`)                   |
| Headers            | [`apps/web/public/_headers`](../apps/web/public/_headers)                                |
| Redirects          | [`apps/web/public/_redirects`](../apps/web/public/_redirects)                            |
| `/api/supply`      | Pages Function [`functions/api/supply.js`](../functions/api/supply.js)                   |
| Analytics          | None (Vercel Web Analytics was removed)                                                  |

Checked on the preview deployment of 2026-10-30: pages answer 200, `/about` redirects to
`/about/`, `/core/team/...` redirects to `/core/`, unknown paths answer 404, the site and the app
get their own headers, and `/api/supply` returns the on-chain figures (it falls back to other
public Base RPCs when one refuses). No API token or GitHub secret is needed.

## Owner steps (one time)

1. **Build command.** Workers & Pages → `arlcoin-io` → Settings → Build: build command
   `bash scripts/build-cloudflare.sh` (the output directory comes from `wrangler.toml`).
2. **DNS.** arlcoin.io's nameservers are Vercel's (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). In
   Cloudflare: Add a domain → `arlcoin.io` → Free plan. Check that the imported records include
   the mail records (MX `mx1.improvmx.com` priority 10, MX `mx2.improvmx.com` priority 20, TXT
   `v=spf1 include:spf.improvmx.com ~all`), then set Cloudflare's two nameservers at the registrar
   where arlcoin.io was bought.
3. **Custom domains.** Pages project → Custom domains → add `arlcoin.io` and `www.arlcoin.io`.
4. **Search Console.** After the domain answers 200: Sitemaps → resubmit
   `https://arlcoin.io/sitemap.xml`, and URL Inspection → Request indexing for the home page.

## Testnet operator API

The testnet operator API runs on the same Pages project as a Pages Function,
`functions/api/operator/[action].js`, at `arlcoin.io/api/operator/*`. The build bundles its
handler (`apps/dapp/lib/server/operatorHttp.ts`) into `build/operator.mjs`. The Base Sepolia
operator key is the project's encrypted variable `ARL_OPERATOR_KEY` (Settings → Variables and
Secrets, type Secret), set by the owner; `wrangler.toml` turns on `nodejs_compat` so the handler
reads it from `process.env`. Once `arlcoin.io/api/operator/status` answers, set the repository
variable `OPERATOR_LIVE` to `true` (GitHub → Settings → Secrets and variables → Actions →
Variables) so the uptime check covers the operator and the faucet float again.
