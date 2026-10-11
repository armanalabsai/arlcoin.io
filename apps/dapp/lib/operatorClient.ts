// Calls the testnet operator's API (app/api/operator) from the browser. Only used on Base
// Sepolia; on the local chain the app uses development accounts instead. The API runs on the
// server-hosted app; a static copy (arlcoin.io/app) reaches it at NEXT_PUBLIC_ARL_OPERATOR_URL.

/** Where the operator API is: NEXT_PUBLIC_ARL_OPERATOR_URL (an https origin), else this app. */
export function operatorBase(): string {
  const url = process.env.NEXT_PUBLIC_ARL_OPERATOR_URL;
  if (url) {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.hostname !== "127.0.0.1" && u.hostname !== "localhost")
      throw new Error("NEXT_PUBLIC_ARL_OPERATOR_URL must be https");
    return u.origin;
  }
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

export class OperatorError extends Error {
  override name = "OperatorError";
}

/** POSTs `body` to /api/operator/<action> (GET when `body` is undefined) and returns the JSON. */
export async function callOperator<T>(action: string, body?: unknown): Promise<T> {
  const res = await fetch(`${operatorBase()}/api/operator/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new OperatorError(data.error ?? `the operator answered ${String(res.status)}`);
  return data as T;
}
