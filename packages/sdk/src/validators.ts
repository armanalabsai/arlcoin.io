// The validators of the verified evaluators: who has staked, how much, and what each has done.
// Anyone can stake and be named on a committee; this is the public record a client or a provider
// reads before naming one.
//
// What a validator did (accepted jobs, votes, slashes) comes from the evaluators' events; its
// stake and the part locked in running jobs are read from the contract at the same block.

import { getAddress, isAddressEqual, parseAbi, type Address } from "viem";

import {
  HISTORY_START,
  VERIFIED_EVALUATORS,
  blockTime,
  readProtocolLogs,
  type HistoryOptions,
} from "./agentScore.ts";
import { publicClientOf, type ReadClient } from "./client.ts";

const stakeAbi = parseAbi([
  "function stakeOf(address validator) view returns (uint256)",
  "function lockedOf(address validator) view returns (uint256)",
]);

/** Most validators whose stake is read in one answer; the rest are listed without it. */
const MAX_STAKE_READS = 25;

export interface ValidatorRecord {
  token: "ARL" | "USDC";
  evaluator: Address;
  validator: Address;
  /** Stake and the part locked as bonds on running jobs, in base units of the stake token. */
  stake?: string;
  locked?: string;
  /** Jobs it accepted a seat on. */
  accepted: number;
  /** Votes cast, by direction. */
  approved: number;
  rejected: number;
  /** Times a bond of its was slashed, and the total, in base units. */
  slashes: number;
  slashed: string;
  /** Unix seconds of its first stake. */
  since?: number;
}

export interface Validators {
  /** The block everything was read at. */
  block: bigint;
  validators: ValidatorRecord[];
}

/** Reads every validator that ever staked on a verified evaluator, most active first. */
export async function getValidators(c: ReadClient, opts: HistoryOptions = {}): Promise<Validators> {
  const client = publicClientOf(c);
  const head = await client.getBlock();
  const logs = await readProtocolLogs(client, HISTORY_START, head.number, opts);
  const records = new Map<string, ValidatorRecord & { firstBlock?: bigint }>();

  for (const l of logs) {
    const deployment = VERIFIED_EVALUATORS.find((e) => isAddressEqual(e.evaluator, l.address));
    if (!deployment) continue;
    const args = l.args as Record<string, unknown>;
    const who = l.eventName === "Slashed" ? args.account : (args.validator as string | undefined);
    if (typeof who !== "string") continue;
    const key = `${deployment.token}:${who.toLowerCase()}`;
    let r = records.get(key);
    if (!r) {
      // A slash of an address that never staked is a challenger's bond, not a validator's.
      if (l.eventName !== "Staked") continue;
      r = {
        token: deployment.token,
        evaluator: deployment.evaluator,
        validator: getAddress(who),
        accepted: 0,
        approved: 0,
        rejected: 0,
        slashes: 0,
        slashed: "0",
        firstBlock: l.blockNumber,
      };
      records.set(key, r);
    }
    if (l.eventName === "Accepted") r.accepted += 1;
    else if (l.eventName === "Voted") {
      if (args.approve === true) r.approved += 1;
      else r.rejected += 1;
    } else if (l.eventName === "Slashed") {
      r.slashes += 1;
      r.slashed = (BigInt(r.slashed) + (args.amount as bigint)).toString();
    }
  }

  const list = [...records.values()].sort(
    (a, b) =>
      b.approved + b.rejected - (a.approved + a.rejected) ||
      b.accepted - a.accepted ||
      a.validator.localeCompare(b.validator),
  );
  const at = { blockNumber: head.number };
  const validators: ValidatorRecord[] = [];
  for (const [i, { firstBlock, ...r }] of list.entries()) {
    if (firstBlock !== undefined) r.since = await blockTime(client, firstBlock);
    if (i < MAX_STAKE_READS) {
      const read = (functionName: "stakeOf" | "lockedOf") =>
        client.readContract({
          address: r.evaluator,
          abi: stakeAbi,
          functionName,
          args: [r.validator],
          ...at,
        });
      r.stake = (await read("stakeOf")).toString();
      r.locked = (await read("lockedOf")).toString();
    }
    validators.push(r);
  }
  return { block: head.number, validators };
}
