// Calls the testnet operator's API (app/api/operator) from the browser. Only used on Base
// Sepolia; on the local chain the app uses development accounts instead.

export class OperatorError extends Error {
  override name = "OperatorError";
}

/** POSTs `body` to /api/operator/<action> (GET when `body` is undefined) and returns the JSON. */
export async function callOperator<T>(action: string, body?: unknown): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/operator/${action}`, {
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
