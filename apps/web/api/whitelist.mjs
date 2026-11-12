// POST /api/whitelist  {wallet, email, noticeVersion, privacyAccepted, transferConsent}
//
// Stores one whitelist registration in the Cloudflare D1 database `arl-whitelist`
// (db/whitelist/0001_whitelist.sql), which holds ARL data only. It inserts and never returns
// stored data: a new and an existing entry get the same answer, so the form does not reveal who
// is registered. A coarse global throttle refuses scripted flooding.
//
// Served by the Cloudflare Pages Function functions/api/whitelist.js, which passes the D1 binding.

const WALLET = /^0x[0-9a-f]{40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOTICE = /^[0-9A-Za-z._-]{1,32}$/;
/** Registrations accepted from all visitors together in THROTTLE_MINUTES. */
export const THROTTLE_LIMIT = 200;
export const THROTTLE_MINUTES = 10;
const MAX_BODY = 2048;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Validates and normalises a request body; returns null when it is not a registration. */
export function parseRegistration(body) {
  if (!body || typeof body !== "object") return null;
  const wallet = typeof body.wallet === "string" ? body.wallet.trim().toLowerCase() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const notice = typeof body.noticeVersion === "string" ? body.noticeVersion.trim() : "";
  if (!WALLET.test(wallet) || /^0x0{40}$/.test(wallet)) return null;
  if (email.length < 6 || email.length > 254 || !EMAIL.test(email)) return null;
  if (!NOTICE.test(notice)) return null;
  if (body.privacyAccepted !== true || body.transferConsent !== true) return null;
  return { wallet, email, notice };
}

export async function handle(request, db) {
  if (request.method !== "POST") return json(405, { error: "method not allowed" });
  if (!db) return json(503, { error: "not configured" });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too large" });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid" });
  }
  const reg = parseRegistration(body);
  if (!reg) return json(400, { error: "invalid" });

  const recent = await db
    .prepare(
      `SELECT count(*) AS n FROM whitelist WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-${THROTTLE_MINUTES} minutes')`,
    )
    .first();
  if (Number(recent?.n ?? 0) >= THROTTLE_LIMIT) return json(429, { error: "try again later" });

  await db
    .prepare(
      "INSERT INTO whitelist (wallet, email, privacy_notice_version) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING",
    )
    .bind(reg.wallet, reg.email, reg.notice)
    .run();
  return json(200, { ok: true });
}
