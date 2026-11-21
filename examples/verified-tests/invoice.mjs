// A small module with a testable contract: totals of an invoice in integer cents.
// It exists so that anyone can hire an ARL provider to run its tests and have validators re-run
// them (docs/run-a-provider.md). No dependencies, no network, no clock: the run is deterministic.

/** @param {{ unitCents: number, quantity: number }[]} lines */
export function subtotal(lines) {
  let total = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.unitCents) || line.unitCents < 0)
      throw new RangeError("unitCents");
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) throw new RangeError("quantity");
    total += line.unitCents * line.quantity;
  }
  return total;
}

/** Tax in cents for a rate in basis points, rounded half up. */
export function tax(cents, rateBps) {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) throw new RangeError("rateBps");
  return Math.floor((cents * rateBps + 5000) / 10000);
}

export function total(lines, rateBps) {
  const net = subtotal(lines);
  return net + tax(net, rateBps);
}
