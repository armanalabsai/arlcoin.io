// A minimal Model Context Protocol server over stdio (https://modelcontextprotocol.io): newline-
// delimited JSON-RPC 2.0 with `initialize`, `ping`, `tools/list` and `tools/call`. Written out
// rather than taken from an SDK so the server has no dependency beyond viem: it only exposes
// tools, never resources, prompts or sampling, and never runs anything a message names.

export const SERVER_INFO = { name: "arl-protocol", version: "0.1.0" } as const;

/** Protocol revisions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  inputSchema: Record<string, unknown>;
  /** Returns a JSON-serialisable result; throws to report a tool error to the model. */
  run(args: Record<string, unknown>): Promise<unknown>;
}

type Id = string | number;

interface Request {
  jsonrpc: "2.0";
  id?: Id | null;
  method: string;
  params?: unknown;
}

export interface Response {
  jsonrpc: "2.0";
  id: Id | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/** JSON with bigints as decimal strings. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(id: Id | null, code: number, message: string): Response {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Handles one parsed message; returns the response, or null for a notification. */
export async function handle(message: unknown, tools: readonly Tool[]): Promise<Response | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    const id =
      isRecord(message) && (typeof message.id === "string" || typeof message.id === "number")
        ? message.id
        : null;
    return fail(id, INVALID_REQUEST, "not a JSON-RPC 2.0 request");
  }
  const req = message as unknown as Request;
  // A message without an id is a notification (initialized, cancelled): never answered.
  if (req.id === undefined) return null;
  const id = req.id;
  if (id !== null && typeof id !== "string" && typeof id !== "number") {
    return fail(null, INVALID_REQUEST, "id must be a string or a number");
  }
  const params = isRecord(req.params) ? req.params : {};
  switch (req.method) {
    case "initialize": {
      const asked = params.protocolVersion;
      const version = (PROTOCOL_VERSIONS as readonly unknown[]).includes(asked)
        ? (asked as string)
        : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "ARL Protocol on Base Mainnet. Check arl-task/1 tasks, read verified jobs and prepare unsigned transactions. This server holds no key and sends nothing: the user's own wallet signs every transaction it prepares.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return fail(id, INVALID_PARAMS, `unknown tool ${String(params.name)}`);
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isRecord(args)) return fail(id, INVALID_PARAMS, "arguments must be an object");
      try {
        const out = await tool.run(args);
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: toJson(out) }], isError: false },
        };
      } catch (e) {
        // Tool failures go back to the model as a result it can read and correct.
        const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
      }
    }
    default:
      return fail(id, METHOD_NOT_FOUND, `method ${req.method} is not supported`);
  }
}

/** Handles one line of input: a message or a batch is not allowed to crash the server. */
export async function handleLine(line: string, tools: readonly Tool[]): Promise<string | null> {
  if (line.trim() === "") return null;
  let message: unknown;
  try {
    message = JSON.parse(line) as unknown;
  } catch {
    return JSON.stringify(fail(null, PARSE_ERROR, "invalid JSON"));
  }
  const res = await handle(message, tools);
  return res === null ? null : JSON.stringify(res);
}
