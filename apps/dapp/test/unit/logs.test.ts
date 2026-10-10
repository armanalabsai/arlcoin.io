import assert from "node:assert/strict";
import { test } from "node:test";

import { isRangeError, MIN_SPAN, readRange, splitRange } from "../../lib/logs.ts";

test("splitRange covers the range exactly, in order", () => {
  const parts = splitRange({ fromBlock: 10n, toBlock: 25n }, 7n);
  assert.deepEqual(parts, [
    { fromBlock: 10n, toBlock: 16n },
    { fromBlock: 17n, toBlock: 23n },
    { fromBlock: 24n, toBlock: 25n },
  ]);
  assert.throws(() => splitRange({ fromBlock: 0n, toBlock: 1n }, 0n));
});

test("recognises the range errors of public endpoints", () => {
  assert.ok(isRangeError(new Error("eth_getLogs is limited to a 200 range")));
  assert.ok(isRangeError(new Error("exceed maximum block range: 50000")));
  assert.ok(isRangeError(new Error("ranges over 10000 blocks are not supported on free plan")));
  assert.ok(!isRangeError(new Error("execution reverted")));
});

test("readRange splits refused ranges and keeps every log once, in order", async () => {
  const limit = 1_000n;
  let calls = 0;
  const read = ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
    calls++;
    if (toBlock - fromBlock + 1n > limit)
      return Promise.reject(new Error("limited to a 1000 range"));
    const out: bigint[] = [];
    for (let b = fromBlock; b <= toBlock; b++) if (b % 97n === 0n) out.push(b);
    return Promise.resolve(out);
  };
  const logs = await readRange({ fromBlock: 5n, toBlock: 20_000n }, read);
  const expected: bigint[] = [];
  for (let b = 5n; b <= 20_000n; b++) if (b % 97n === 0n) expected.push(b);
  assert.deepEqual(logs, expected);
  assert.ok(calls > 1);
});

test("readRange rethrows real errors and stops at the smallest span", async () => {
  await assert.rejects(
    readRange({ fromBlock: 0n, toBlock: 10n }, () =>
      Promise.reject(new Error("execution reverted")),
    ),
    /reverted/,
  );
  await assert.rejects(
    readRange({ fromBlock: 0n, toBlock: MIN_SPAN * 4n }, () =>
      Promise.reject(new Error("limited to a 1 range")),
    ),
    /limited/,
  );
  assert.deepEqual(await readRange({ fromBlock: 5n, toBlock: 4n }, () => Promise.resolve([1])), []);
});
