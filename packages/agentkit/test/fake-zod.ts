// A stand-in for the few zod builders arlActions uses, with zod's safeParse shape. ARL code does
// not import zod (scripts/check-zod.mjs, GHSA-mrhx-c7xc-m3w5); at runtime the caller passes the
// zod that their AgentKit setup already uses.

type Check = (value: unknown) => boolean;

class Schema {
  readonly check: Check;
  readonly description: string;
  constructor(check: Check, description = "") {
    this.check = check;
    this.description = description;
  }
  describe(description: string): Schema {
    return new Schema(this.check, description);
  }
  optional(): Schema {
    return new Schema((v) => v === undefined || this.check(v), this.description);
  }
  regex(pattern: RegExp): Schema {
    return new Schema((v) => this.check(v) && pattern.test(v as string), this.description);
  }
  safeParse(value: unknown): { success: boolean } {
    return { success: this.check(value) };
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const fakeZod = {
  object: (shape: Record<string, unknown>) =>
    new Schema(
      (v) => isRecord(v) && Object.entries(shape).every(([k, s]) => (s as Schema).check(v[k])),
    ),
  string: () => new Schema((v) => typeof v === "string"),
  array: (item: never) =>
    new Schema((v) => Array.isArray(v) && v.every((x) => (item as Schema).check(x))),
  record: (_key: never, value: never) =>
    new Schema((v) => isRecord(v) && Object.values(v).every((x) => (value as Schema).check(x))),
  unknown: () => new Schema(() => true),
  enum: (values: readonly [string, ...string[]]) =>
    new Schema((v) => typeof v === "string" && values.includes(v)),
};

export type FakeSchema = Schema;
