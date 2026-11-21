import assert from "node:assert/strict";
import { test } from "node:test";

import { subtotal, tax, total } from "./invoice.mjs";

test("subtotal multiplies and adds in integer cents", () => {
  assert.equal(
    subtotal([
      { unitCents: 1999, quantity: 3 },
      { unitCents: 250, quantity: 2 },
    ]),
    6497,
  );
  assert.equal(subtotal([]), 0);
});

test("subtotal refuses fractions and negatives", () => {
  assert.throws(() => subtotal([{ unitCents: 19.99, quantity: 1 }]), RangeError);
  assert.throws(() => subtotal([{ unitCents: 100, quantity: -1 }]), RangeError);
});

test("tax rounds half up", () => {
  assert.equal(tax(1000, 2000), 200);
  assert.equal(tax(125, 2000), 25);
  assert.equal(tax(1, 5000), 1);
  assert.equal(tax(0, 2000), 0);
});

test("total is the subtotal plus its tax", () => {
  assert.equal(total([{ unitCents: 1000, quantity: 2 }], 1800), 2360);
});
