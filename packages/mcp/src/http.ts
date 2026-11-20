// Agent API v1 (docs/protocol/developer-experience.md, 6.2): the MCP tools over plain HTTP JSON,
// read-only and stateless. Served by the Cloudflare Pages Function functions/api/v1/[[path]].ts at
// arlcoin.io/api/v1/*. Every chain answer names the block it was read at.
//
//   GET  /api/v1/policies                 built-in arl-policy/1 documents and hashes
//   POST /api/v1/tasks/check              body: { task, policy? } -> hashes and policy verdict
//   GET  /api/v1/jobs/{ARL|USDC}/{jobId}   job, committee configuration and verdict
//   GET  /api/v1/jobs/{ARL|USDC}/{jobId}/audit every on-chain event of the job, in order
//   GET  /api/v1/agents/{agentId}/outcomes verified approvals and rejections of an agent
//   GET  /api/v1/agents/{agentId}/score    the agent's arl-reputation/1 score and its outcomes
//   GET  /api/v1/graph                    the trust graph: agents, scores and client-agent edges
//   GET  /api/v1/agents/{agentId}/badge.svg the same record as an SVG badge for a README or a page
//   POST /api/v1/evidence/check           body: { evidence } -> outcome of an arl-evidence/2
//   POST /api/v1/jobs/prepare             body: as arl_prepare_job -> unsigned createJob
//   POST /api/v1/jobs/prepare-funding     body: as arl_prepare_funding -> unsigned funding calls
//
// Nothing here holds a key or sends a transaction.

import { toJson, type Tool } from "./server.ts";

/** Largest request body accepted, in bytes. */
export const MAX_BODY_BYTES = 64 * 1024;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
};

function json(status: number, body: unknown, cache = "no-store"): Response {
  return new Response(`${toJson(body)}\n`, {
    status,
    headers: { ...HEADERS, "cache-control": cache },
  });
}

const BADGE = /^\/api\/v1\/agents\/([0-9]{1,78})\/badge\.svg$/;

/** Text width in a badge, close enough for 11px Verdana without measuring glyphs. */
const width = (text: string) => Math.round(text.length * 6.6) + 12;

/**
 * A two-part SVG badge: "ARL verified" and what the chain records. Both texts are built here from
 * numbers only, so nothing a caller sends reaches the SVG.
 */
export function badgeSvg(right: string, color: string): string {
  const left = "ARL verified";
  const lw = width(left);
  const rw = width(right);
  const w = lw + rw;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="20" role="img" aria-label="${left}: ${right}">` +
    `<title>${left}: ${right}</title>` +
    `<clipPath id="r"><rect width="${String(w)}" height="20" rx="3"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${String(lw)}" height="20" fill="#1f2937"/>` +
    `<rect x="${String(lw)}" width="${String(rw)}" height="20" fill="${color}"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${String(lw / 2)}" y="14">${left}</text>` +
    `<text x="${String(lw + rw / 2)}" y="14">${right}</text></g></svg>\n`
  );
}

/** The badge text for a score: counts of verified outcomes, never an estimate. */
export function badgeText(score: { outcomes: number; completed: number }): string {
  if (score.outcomes === 0) return "no verified jobs yet";
  const pct = Math.round((score.completed / score.outcomes) * 100);
  return `${String(score.outcomes)} ${score.outcomes === 1 ? "job" : "jobs"}, ${String(pct)}% approved`;
}

function svg(status: number, body: string, cache: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
      "cache-control": cache,
    },
  });
}

async function badge(agentId: string, tools: readonly Tool[]): Promise<Response> {
  const tool = tools.find((t) => t.name === "arl_get_agent_score");
  try {
    if (!tool) throw new Error("tool missing");
    const score = (await tool.run({ agentId })) as { outcomes: unknown[]; completed: number };
    const text = badgeText({ outcomes: score.outcomes.length, completed: score.completed });
    return svg(
      200,
      badgeSvg(text, score.outcomes.length > 0 ? "#15803d" : "#6b7280"),
      "public, max-age=300",
    );
  } catch {
    return svg(502, badgeSvg("unavailable", "#6b7280"), "no-store");
  }
}

const ROUTES: { method: "GET" | "POST"; path: RegExp; tool: string }[] = [
  { method: "GET", path: /^\/api\/v1\/policies$/, tool: "arl_list_policies" },
  { method: "POST", path: /^\/api\/v1\/tasks\/check$/, tool: "arl_check_task" },
  { method: "GET", path: /^\/api\/v1\/jobs\/(ARL|USDC)\/([0-9]{1,78})$/, tool: "arl_get_job" },
  {
    method: "GET",
    path: /^\/api\/v1\/jobs\/(ARL|USDC)\/([0-9]{1,78})\/audit$/,
    tool: "arl_get_job_audit",
  },
  {
    method: "GET",
    path: /^\/api\/v1\/agents\/([0-9]{1,78})\/outcomes$/,
    tool: "arl_get_agent_outcomes",
  },
  {
    method: "GET",
    path: /^\/api\/v1\/agents\/([0-9]{1,78})\/score$/,
    tool: "arl_get_agent_score",
  },
  { method: "GET", path: /^\/api\/v1\/graph$/, tool: "arl_get_trust_graph" },
  { method: "POST", path: /^\/api\/v1\/evidence\/check$/, tool: "arl_check_evidence" },
  { method: "POST", path: /^\/api\/v1\/jobs\/prepare$/, tool: "arl_prepare_job" },
  { method: "POST", path: /^\/api\/v1\/jobs\/prepare-funding$/, tool: "arl_prepare_funding" },
];

async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
    throw new HttpError(413, "body too large");
  let v: unknown;
  try {
    v = JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "body is not JSON");
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new HttpError(400, "body must be a JSON object");
  }
  return v as Record<string, unknown>;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Answers one request with the given tools (arlTools). */
export async function handleHttp(request: Request, tools: readonly Tool[]): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }
  const badgeMatch = BADGE.exec(pathname);
  if (badgeMatch) {
    if (request.method !== "GET") return json(405, { error: "use GET" });
    return badge(badgeMatch[1] as string, tools);
  }
  const matches = ROUTES.filter((r) => r.path.test(pathname));
  if (matches.length === 0)
    return json(404, { error: "not found", docs: "https://arlcoin.io/build" });
  const route = matches.find((r) => r.method === request.method);
  if (!route) return json(405, { error: `use ${matches.map((r) => r.method).join(" or ")}` });
  const tool = tools.find((t) => t.name === route.tool);
  if (!tool) return json(500, { error: "tool missing" });
  try {
    let args: Record<string, unknown>;
    if (route.method === "GET") {
      const m = route.path.exec(pathname);
      args =
        (route.tool === "arl_get_job" || route.tool === "arl_get_job_audit") && m
          ? { token: m[1], jobId: m[2] }
          : (route.tool === "arl_get_agent_outcomes" || route.tool === "arl_get_agent_score") && m
            ? { agentId: m[1] }
            : {};
    } else {
      args = await body(request);
    }
    const out = await tool.run(args);
    // Policies never change within a release; chain reads are fresh for a short while only.
    const cache =
      route.tool === "arl_list_policies"
        ? "public, max-age=3600"
        : route.tool === "arl_get_job" || route.tool === "arl_get_agent_outcomes"
          ? "public, max-age=10"
          : route.tool === "arl_get_agent_score" ||
              route.tool === "arl_get_trust_graph" ||
              route.tool === "arl_get_job_audit"
            ? "public, max-age=60"
            : "no-store";
    return json(200, out, cache);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    const name = e instanceof Error ? e.name : "Error";
    const message = e instanceof Error ? e.message : String(e);
    // Validation errors are the caller's to fix; anything else (an RPC failing) is ours.
    const client =
      /^(TaskError|PolicyError|ProofError|EvidenceError|ToolInputError|CanonicalError)$/.test(name);
    return json(client ? 400 : 502, {
      error: client ? `${name}: ${message}` : "chain read failed, try again",
    });
  }
}
