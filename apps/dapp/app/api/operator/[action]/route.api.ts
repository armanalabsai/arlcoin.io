// The testnet operator's HTTP API for local development with the Next.js server (the static export
// has no API). On arlcoin.io the same handler runs as a Cloudflare Pages Function
// (functions/api/operator/[action].js). See lib/server/operatorHttp.ts.
import { handleOperator } from "~~/lib/server/operatorHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ action: string }> };

export async function OPTIONS(req: Request, { params }: Context) {
  return handleOperator(req, (await params).action);
}

export async function GET(req: Request, { params }: Context) {
  return handleOperator(req, (await params).action);
}

export async function POST(req: Request, { params }: Context) {
  return handleOperator(req, (await params).action);
}
