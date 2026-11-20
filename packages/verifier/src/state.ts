// The validator's watch state on disk: where discovery resumes, the jobs it still tracks and the
// spec each accepted job was checked against. Losing it silently means missed votes (and burned
// bonds), so it is written atomically and a file that cannot be read stops the validator instead of
// being treated as a first start (security report 2026-11-20).

import { open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

import { parseSpec } from "./spec.ts";
import type { WatchState } from "./watch.ts";

/** Parses a saved state; throws on anything that is not exactly the saved shape. */
export function parseWatchState(text: string): WatchState {
  const raw = JSON.parse(text) as unknown;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("not a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.fromBlock !== "string" || !/^\d+$/.test(o.fromBlock)) {
    throw new Error("fromBlock is not a block number");
  }
  if (!Array.isArray(o.jobs) || !o.jobs.every((j) => typeof j === "string" && /^\d+$/.test(j))) {
    throw new Error("jobs is not a list of job ids");
  }
  const specs: NonNullable<WatchState["specs"]> = {};
  if (o.specs !== undefined) {
    if (o.specs === null || typeof o.specs !== "object" || Array.isArray(o.specs)) {
      throw new Error("specs is not an object");
    }
    for (const [id, spec] of Object.entries(o.specs as Record<string, unknown>)) {
      if (!/^\d+$/.test(id)) throw new Error(`specs has a key that is not a job id: ${id}`);
      specs[id] = parseSpec(spec);
    }
  }
  return { fromBlock: BigInt(o.fromBlock), jobs: o.jobs as string[], specs };
}

export function serializeWatchState(state: WatchState): string {
  return JSON.stringify({
    fromBlock: state.fromBlock.toString(),
    jobs: state.jobs,
    specs: state.specs ?? {},
  });
}

/**
 * Writes the state to a temporary file next to `path`, flushes it to disk, then renames it over
 * `path`: a crash leaves either the old file or the new one, never a torn one.
 */
export async function saveWatchState(path: string, state: WatchState): Promise<void> {
  const tmp = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(serializeWatchState(state), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, path);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}
