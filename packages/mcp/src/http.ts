// Agent API v1 (docs/protocol/developer-experience.md, 6.2): the MCP tools over plain HTTP JSON,
// read-only and stateless. Served by the Cloudflare Pages Function functions/api/v1/[[path]].ts at
// arlcoin.io/api/v1/*. Every chain answer names the block it was read at.
//
//   GET  /api/v1/policies                 built-in arl-policy/1 documents and hashes
//   POST /api/v1/tasks/check              body: { task, policy? } -> hashes and policy verdict
//   GET  /api/v1/jobs/{ARL|USDC}/{jobId}   job, committee configuration and verdict
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

const ROUTES: { method: "GET" | "POST"; path: RegExp; tool: string }[] = [
  { method: "GET", path: /^\/api\/v1\/policies$/, tool: "arl_list_policies" },
  { method: "POST", path: /^\/api\/v1\/tasks\/check$/, tool: "arl_check_task" },
  { method: "GET", path: /^\/api\/v1\/jobs\/(ARL|USDC)\/([0-9]{1,78})$/, tool: "arl_get_job" },
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
      args = route.tool === "arl_get_job" && m ? { token: m[1], jobId: m[2] } : {};
    } else {
      args = await body(request);
    }
    const out = await tool.run(args);
    // Policies never change within a release; chain reads are fresh for a short while only.
    const cache =
      route.tool === "arl_list_policies"
        ? "public, max-age=3600"
        : route.tool === "arl_get_job"
          ? "public, max-age=10"
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
