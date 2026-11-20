// The audit trail of a verified job, as ARLscan shows it. The trail comes from the Agent API
// (GET /api/v1/jobs/{token}/{jobId}/audit), which reads it from the chain; everything in the
// answer is checked here before it reaches the page, and anything malformed is left out.

/** Same origin as the app (arlcoin.io/app), so the page's content security policy allows it. */
export const AUDIT_API = "/api/v1";

/** The trail exists for Base Mainnet only: a local or test build has no Agent API. */
export const AUDIT_AVAILABLE = process.env.NEXT_PUBLIC_ARL_CHAIN === "8453";

export interface AuditStep {
  /** What happened, in one sentence. */
  step: string;
  event: string;
  /** Unix seconds of the block. */
  at: number;
  transaction: `0x${string}`;
  actor?: `0x${string}`;
}

export interface Audit {
  /** The block the trail was read at. */
  block: string;
  steps: AuditStep[];
}

const TX = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_STEPS = 200;

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max && !/\p{Cc}/u.test(v) ? v : null;

export function auditUrl(jobId: bigint, token: "ARL" | "USDC" = "ARL"): string {
  return `${AUDIT_API}/jobs/${token}/${jobId.toString()}/audit`;
}

/** Reads the API's answer into the steps the page shows. Throws when it is not an audit trail. */
export function parseAudit(body: unknown): Audit {
  const b = body as { block?: unknown; entries?: unknown } | null;
  if (!b || typeof b.block !== "string" || !/^\d+$/.test(b.block) || !Array.isArray(b.entries))
    throw new Error("the answer is not an audit trail");
  const steps: AuditStep[] = [];
  for (const raw of b.entries.slice(0, MAX_STEPS)) {
    const e = raw as Record<string, unknown> | null;
    if (!e) continue;
    const step = text(e.step, 200);
    const event = text(e.event, 40);
    const transaction = typeof e.transaction === "string" && TX.test(e.transaction);
    if (!step || !event || !transaction || typeof e.at !== "number" || !Number.isFinite(e.at))
      continue;
    steps.push({
      step,
      event,
      at: e.at,
      transaction: e.transaction as `0x${string}`,
      ...(typeof e.actor === "string" && ADDRESS.test(e.actor)
        ? { actor: e.actor as `0x${string}` }
        : {}),
    });
  }
  return { block: b.block, steps };
}
