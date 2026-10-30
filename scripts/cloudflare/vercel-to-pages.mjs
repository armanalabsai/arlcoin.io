// Writes Cloudflare Pages' _headers and _redirects from apps/web/vercel.json, so the headers and
// redirects have one source. Only the patterns vercel.json uses are translated; anything else
// stops the build instead of being served without its headers.
//
//   node scripts/cloudflare/vercel-to-pages.mjs <vercel.json> <output-dir>

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const [file, out] = process.argv.slice(2);
if (!file || !out) {
  process.stderr.write("usage: vercel-to-pages.mjs <vercel.json> <output-dir>\n");
  process.exit(1);
}
const vercel = JSON.parse(readFileSync(file, "utf8"));

// Vercel source -> Pages path. "/((?!app/).*)" (every path but the app) becomes "/*"; the app
// rule then detaches those headers before setting its own, since Pages applies every matching rule.
const SITE = "/((?!app/).*)";
const APP = "/app/(.*)";
const pathFor = { [SITE]: "/*", [APP]: "/app/*" };

const rules = vercel.headers ?? [];
for (const r of rules) {
  if (!(r.source in pathFor)) throw new Error(`unsupported header source: ${r.source}`);
}
const siteNames = (rules.find((r) => r.source === SITE)?.headers ?? []).map((h) => h.key);

let headers = "";
for (const r of rules) {
  headers += `${pathFor[r.source]}\n`;
  if (r.source === APP) for (const name of siteNames) headers += `  ! ${name}\n`;
  for (const h of r.headers) headers += `  ${h.key}: ${h.value}\n`;
}

// Redirects: ":param" becomes the splat; Vercel's permanent redirect is a 308. The splat also
// matches slashes, so a source that only adds a trailing slash after it is already covered.
let redirects = "";
const seen = new Set();
for (const r of vercel.redirects ?? []) {
  const params = r.source.match(/:[a-z]+/gi) ?? [];
  if (params.length > 1 || /[()*]/.test(r.source)) {
    throw new Error(`unsupported redirect source: ${r.source}`);
  }
  let source = params.length ? r.source.replace(params[0], "*") : r.source;
  if (source.endsWith("*/")) source = source.slice(0, -1);
  if (seen.has(source)) continue;
  seen.add(source);
  redirects += `${source} ${r.destination} ${r.permanent ? 308 : 307}\n`;
}

writeFileSync(join(out, "_headers"), headers);
writeFileSync(join(out, "_redirects"), redirects);
process.stdout.write(`_headers: ${rules.length} rules, _redirects: ${seen.size} rules\n`);
