// The local demo poll on ARLAnonymousSignal (group 0). Development values.

/** Anvil development account 0: deployed the contract and administers the demo group. */
export const DEMO_GROUP_ADMIN = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
/** Anvil development account 6: submits signals so the voter's wallet is not the sender. */
export const DEMO_RELAYER = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;

export const DEMO_GROUP = 0n;
export const POLL = {
  scope: 1n,
  question: "Which ARL feature should ship next?",
  options: ["Compute marketplace", "Mobile wallet support", "More staking pools"],
} as const;

/** Option index (0-based) to the signalled message (1-based), and back. */
export const optionMessage = (index: number): bigint => BigInt(index + 1);
export const messageOption = (message: bigint): number | undefined => {
  const i = Number(message) - 1;
  return i >= 0 && i < POLL.options.length ? i : undefined;
};

/** Counts votes per option from Signal events of the poll's scope. */
export function tally(signals: readonly { scope: bigint; message: bigint }[]): number[] {
  const counts: number[] = POLL.options.map(() => 0);
  for (const s of signals) {
    if (s.scope !== POLL.scope) continue;
    const i = messageOption(s.message);
    if (i !== undefined) counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}
