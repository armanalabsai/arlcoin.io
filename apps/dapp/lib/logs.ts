// Event history that works on public RPCs. Public endpoints cap eth_getLogs ranges (Base Sepolia's
// own endpoint at 200 blocks, others at 10,000 or 50,000), so a history read starts at the
// contract's deployment block, not 0, and a range the endpoint refuses is split in halves until
// it is accepted. Results keep chain order. On the local chain one request covers everything.

export interface BlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

/** The smallest range ever requested; Base Sepolia's public endpoint accepts 200 blocks. */
export const MIN_SPAN = 200n;
/** Ranges read at the same time once a range has to be split. */
export const CONCURRENCY = 4;

const RANGE_ERROR =
  /range|limit|too many|exceed|block range|query returned more than|response size|10000|-32614|-32005/i;

/** Whether an RPC error means "ask for a smaller range" rather than a real failure. */
export function isRangeError(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.message} ${(error as { details?: string }).details ?? ""} ${String((error as { cause?: unknown }).cause ?? "")}`
      : String(error);
  return RANGE_ERROR.test(text);
}

/** Splits [from, to] into consecutive ranges of at most `span` blocks. */
export function splitRange({ fromBlock, toBlock }: BlockRange, span: bigint): BlockRange[] {
  if (span <= 0n) throw new Error("span must be positive");
  const out: BlockRange[] = [];
  for (let start = fromBlock; start <= toBlock; start += span) {
    const end = start + span - 1n;
    out.push({ fromBlock: start, toBlock: end < toBlock ? end : toBlock });
  }
  return out;
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  }
  return out;
}

/**
 * Reads `read(range)` over [fromBlock, toBlock]. When the endpoint refuses a range as too large,
 * the range is split in two and each half is read (recursively, down to MIN_SPAN).
 */
export async function readRange<T>(
  range: BlockRange,
  read: (range: BlockRange) => Promise<T[]>,
): Promise<T[]> {
  if (range.fromBlock > range.toBlock) return [];
  try {
    return await read(range);
  } catch (error) {
    const span = range.toBlock - range.fromBlock + 1n;
    if (!isRangeError(error) || span <= MIN_SPAN) throw error;
    const half = (span + 1n) / 2n;
    const parts = splitRange(range, half < MIN_SPAN ? MIN_SPAN : half);
    const results = await inBatches(parts, CONCURRENCY, (part) => readRange(part, read));
    return results.flat();
  }
}

/** Reads `read` from `fromBlock` to the latest block of `client`. */
export async function eventsSince<T>(
  client: { getBlockNumber: () => Promise<bigint> },
  fromBlock: bigint,
  read: (range: BlockRange) => Promise<T[]>,
): Promise<T[]> {
  return readRange({ fromBlock, toBlock: await client.getBlockNumber() }, read);
}
