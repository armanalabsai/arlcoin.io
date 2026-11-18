// Agent2Agent (A2A, https://a2a-protocol.org) for the ARL tools: an agent card describing them as
// skills, and a JSON-RPC endpoint that answers `message/send`. A request names a tool and its
// arguments in a data part ({ "skill": "arl_get_job", "arguments": { ... } }); the answer is a
// message with one data part holding the tool's result. Served at arlcoin.io/a2a by a Cloudflare
// Pages Function; the card is at arlcoin.io/.well-known/agent-card.json. Read-only like the
// Agent API: nothing here holds a key or sends a transaction, and the prepare tools return
// unsigned transactions for the user's own wallet.

import { toJson, type Tool } from "./server.ts";
import { MAX_BODY_BYTES } from "./http.ts";

/** A2A protocol version the card and the endpoint follow. */
export const A2A_PROTOCOL_VERSION = "0.3.0";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};

type Id = string | number | null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The agent card for the given tools, served at `/.well-known/agent-card.json`. */
export function agentCard(tools: readonly Tool[], url = "https://arlcoin.io/a2a") {
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: "ARL Protocol",
    description:
      "Escrow and verification for AI-agent jobs on Base Mainnet. Check arl-task/1 tasks, read verified jobs and agents' verified outcomes, check arl-evidence/2 packages, and prepare unsigned transactions for the user's own wallet. Read-only: it never holds a key or sends a transaction.",
    url,
    preferredTransport: "JSONRPC",
    version: "0.1.0",
    provider: { organization: "ARL Protocol", url: "https://arlcoin.io" },
    documentationUrl: "https://arlcoin.io/build",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: tools.map((t) => ({
      id: t.name,
      name: t.name,
      description: `${t.description} Send a data part { "skill": "${t.name}", "arguments": { ... } }.`,
      tags: ["arl", "base", "escrow", "verification"],
    })),
  };
}

function rpc(id: Id, body: { result: unknown } | { error: { code: number; message: string } }) {
  return new Response(`${toJson({ jsonrpc: "2.0", id, ...body })}\n`, {
    status: 200,
    headers: HEADERS,
  });
}

/** A2A JSON-RPC over HTTP POST: `message/send` only (no streaming, no stored tasks). */
export async function handleA2a(request: Request, tools: readonly Tool[]): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...HEADERS,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }
  if (request.method !== "POST") {
    return new Response(`${toJson({ error: "use POST with A2A JSON-RPC" })}\n`, {
      status: 405,
      headers: HEADERS,
    });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return rpc(null, { error: { code: -32600, message: "request too large" } });
  }
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return rpc(null, { error: { code: -32700, message: "parse error" } });
  }
  if (!isRecord(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpc(null, { error: { code: -32600, message: "invalid request" } });
  }
  const id: Id = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
  if (msg.method !== "message/send") {
    return rpc(id, { error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
  const message = isRecord(msg.params) ? msg.params.message : undefined;
  const parts = isRecord(message) && Array.isArray(message.parts) ? message.parts : [];
  const data = parts.find(
    (p): p is { kind: "data"; data: Record<string, unknown> } =>
      isRecord(p) && p.kind === "data" && isRecord(p.data),
  )?.data;
  const skill = typeof data?.skill === "string" ? data.skill : undefined;
  const tool = tools.find((t) => t.name === skill);
  if (!tool) {
    return rpc(id, {
      error: {
        code: -32602,
        message: `send a data part { "skill": one of ${tools.map((t) => t.name).join(", ")}, "arguments": { ... } }`,
      },
    });
  }
  const args = isRecord(data?.arguments) ? data.arguments : {};
  const contextId =
    isRecord(message) && typeof message.contextId === "string" ? message.contextId : undefined;
  let result: unknown;
  let failed = false;
  try {
    result = JSON.parse(toJson(await tool.run(args))) as unknown;
  } catch (e) {
    failed = true;
    result = { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
  return rpc(id, {
    result: {
      kind: "message",
      role: "agent",
      messageId: crypto.randomUUID(),
      ...(contextId ? { contextId } : {}),
      parts: [{ kind: "data", data: result }],
      metadata: { skill: tool.name, ok: !failed },
    },
  });
}
