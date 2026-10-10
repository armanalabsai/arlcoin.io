// Testnet and production monitoring: a read-only health check of a live ARL deployment.
//
// `ARLVerify` asserts the exact genesis state and must run before any token moves. This check is
// for every moment after that. It reads the chain at one block and reports:
// - critical: a rule of the deployment no longer holds (supply, timelock delay and roles,
//   vesting beneficiaries, schedules and accounting);
// - notice: something the Treasury Safe and the guardian must look at, such as a timelock
//   operation waiting for its delay or ready to execute.
//
// On-chain reads use viem (MIT). Nothing here signs or sends a transaction.

import {
  createPublicClient,
  erc20Abi,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  toBytes,
  type Address,
  type Hex,
} from "viem";

import { MIN_TIMELOCK_HOURS } from "@arl/tokenomics";

import type { DeploymentRecord } from "./manifest.ts";
import type { DeployPlan, VestingPlan } from "./plan.ts";

export const MONITOR_SCHEMA = "arl-monitor-report/1";

const MAX_SUPPLY = 21_000_000n * 10n ** 18n;
const ZERO: Address = "0x0000000000000000000000000000000000000000";

export const ROLES = {
  admin: "0x0000000000000000000000000000000000000000000000000000000000000000",
  proposer: keccak256(toBytes("PROPOSER_ROLE")),
  canceller: keccak256(toBytes("CANCELLER_ROLE")),
  executor: keccak256(toBytes("EXECUTOR_ROLE")),
} as const satisfies Record<string, Hex>;
export type RoleName = keyof typeof ROLES;

/** Who must and must not hold each timelock role; the same table `ARLVerify` checks. */
export function expectedRoles(
  plan: DeployPlan,
  deployment: DeploymentRecord,
): { role: RoleName; account: string; who: string; want: boolean }[] {
  const safe = plan.treasury.safe;
  const guardian = plan.treasury.guardian;
  const rows: { role: RoleName; account: string; who: string; want: boolean }[] = [
    { role: "proposer", account: safe, who: "treasury safe", want: true },
    { role: "canceller", account: safe, who: "treasury safe", want: true },
    { role: "executor", account: safe, who: "treasury safe", want: true },
    { role: "admin", account: deployment.timelock, who: "timelock itself", want: true },
    { role: "admin", account: safe, who: "treasury safe", want: false },
    { role: "canceller", account: guardian, who: "guardian", want: true },
    { role: "proposer", account: guardian, who: "guardian", want: false },
    { role: "executor", account: guardian, who: "guardian", want: false },
    { role: "admin", account: guardian, who: "guardian", want: false },
  ];
  for (const [who, account] of [
    ["zero address", ZERO],
    ["deployer", deployment.deployer],
  ] as const) {
    for (const role of ["admin", "proposer", "canceller", "executor"] as const) {
      rows.push({ role, account, who, want: false });
    }
  }
  return rows;
}

export interface VestingState {
  owner: string;
  cliffStart: bigint;
  cliffEnd: bigint;
  vestingEnd: bigint;
  balance: bigint;
  released: bigint;
  vested: bigint;
}

export type OperationState = "Unset" | "Waiting" | "Ready" | "Done";

export interface TimelockOperation {
  id: Hex;
  state: OperationState;
  /** Unix time from which the operation can be executed (0 once done or cancelled). */
  readyAt: bigint;
  calls: { target: string; value: bigint; data: Hex }[];
}

/** Everything the check needs, read at one block. */
export interface Snapshot {
  chainId: number;
  blockNumber: bigint;
  timestamp: bigint;
  totalSupply: bigint;
  minDelay: bigint;
  /** `${role}:${lowercase account}` → hasRole. */
  roles: Map<string, boolean>;
  vesting: Record<"investors" | "strategicPartnerships", VestingState>;
  operations: TimelockOperation[];
  /** Role grants, role revocations and delay changes seen in the scanned blocks. */
  governanceEvents: { event: string; detail: string; blockNumber: bigint }[];
}

export type Severity = "critical" | "notice";

export interface Finding {
  severity: Severity;
  check: string;
  detail: string;
}

export interface MonitorReport {
  schema: typeof MONITOR_SCHEMA;
  chainId: number;
  blockNumber: string;
  timestamp: string;
  healthy: boolean;
  checks: number;
  findings: Finding[];
}

export class MonitorError extends Error {
  override name = "MonitorError";
}

export const roleKey = (role: RoleName, account: string) => `${role}:${account.toLowerCase()}`;

/** OpenZeppelin `VestingWallet` linear schedule with `start = cliffEnd`. */
export function expectedVested(v: VestingState, at: bigint): bigint {
  const total = v.balance + v.released;
  if (at < v.cliffEnd) return 0n;
  if (at >= v.vestingEnd) return total;
  return (total * (at - v.cliffEnd)) / (v.vestingEnd - v.cliffEnd);
}

/** Pure assessment of a snapshot against the plan. */
export function assess(plan: DeployPlan, deployment: DeploymentRecord, s: Snapshot): MonitorReport {
  const findings: Finding[] = [];
  let checks = 0;
  const expect = (ok: boolean, check: string, detail: string) => {
    checks++;
    if (!ok) findings.push({ severity: "critical", check, detail });
  };

  if (deployment.chainId !== plan.chainId) {
    throw new MonitorError("deployment chainId differs from plan chainId");
  }
  expect(s.chainId === plan.chainId, "chain id", `${String(s.chainId)} ≠ ${String(plan.chainId)}`);

  // Token
  expect(
    s.totalSupply === MAX_SUPPLY && BigInt(plan.maxSupply) === MAX_SUPPLY,
    "total supply",
    `totalSupply ${s.totalSupply.toString()} ≠ ${MAX_SUPPLY.toString()}`,
  );

  // Timelock
  expect(
    s.minDelay === BigInt(plan.treasury.minDelay),
    "timelock delay",
    `minDelay ${s.minDelay.toString()} ≠ planned ${String(plan.treasury.minDelay)}`,
  );
  expect(
    s.minDelay >= BigInt(MIN_TIMELOCK_HOURS) * 3600n,
    "timelock delay floor",
    `minDelay ${s.minDelay.toString()} below 48 hours`,
  );
  for (const r of expectedRoles(plan, deployment)) {
    const has = s.roles.get(roleKey(r.role, r.account));
    expect(
      has === r.want,
      `${r.who} ${r.want ? "holds" : "does not hold"} ${r.role} role`,
      has === undefined ? "not read" : `hasRole is ${String(has)}`,
    );
  }

  // Vesting wallets
  for (const key of ["investors", "strategicPartnerships"] as const) {
    const v = s.vesting[key];
    const p: VestingPlan = plan.vesting[key];
    const allocation = BigInt(plan.allocations[key] ?? "0");
    const name = `${key} vesting`;
    expect(
      v.owner.toLowerCase() === p.beneficiary.toLowerCase(),
      `${name} beneficiary`,
      `owner ${v.owner} ≠ ${p.beneficiary}`,
    );
    expect(
      v.cliffStart === BigInt(p.cliffStart) &&
        v.cliffEnd === BigInt(p.cliffEnd) &&
        v.vestingEnd === BigInt(p.vestingEnd),
      `${name} schedule`,
      `${v.cliffStart.toString()}/${v.cliffEnd.toString()}/${v.vestingEnd.toString()} ≠ plan`,
    );
    // Anyone can send tokens to the wallet, so it may hold more than its allocation, never less.
    expect(
      v.balance + v.released >= allocation,
      `${name} holds its allocation`,
      `balance + released ${(v.balance + v.released).toString()} < ${allocation.toString()}`,
    );
    expect(
      v.released <= v.vested,
      `${name} released no more than vested`,
      `released ${v.released.toString()} > vested ${v.vested.toString()}`,
    );
    expect(
      v.vested === expectedVested(v, s.timestamp),
      `${name} follows the schedule`,
      `vested ${v.vested.toString()} ≠ expected ${expectedVested(v, s.timestamp).toString()}`,
    );
  }

  // Timelock operations: nothing wrong by itself, but the guardian must review each one.
  for (const op of s.operations) {
    if (op.state !== "Waiting" && op.state !== "Ready") continue;
    const calls = op.calls
      .map((c) => `${c.target} value ${c.value.toString()} data ${c.data.slice(0, 10)}`)
      .join("; ");
    findings.push({
      severity: "notice",
      check:
        op.state === "Ready" ? "timelock operation ready to execute" : "timelock operation waiting",
      detail: `${op.id} ready at ${new Date(Number(op.readyAt) * 1000).toISOString()}: ${calls}`,
    });
  }
  for (const e of s.governanceEvents) {
    findings.push({
      severity: "notice",
      check: `timelock ${e.event}`,
      detail: `block ${e.blockNumber.toString()}: ${e.detail}`,
    });
  }

  return {
    schema: MONITOR_SCHEMA,
    chainId: s.chainId,
    blockNumber: s.blockNumber.toString(),
    timestamp: s.timestamp.toString(),
    healthy: findings.every((f) => f.severity !== "critical"),
    checks,
    findings,
  };
}

// ---------------------------------------------------------------- on-chain reads

const timelockAbi = parseAbi([
  "function getMinDelay() view returns (uint256)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getOperationState(bytes32 id) view returns (uint8)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
]);
const vestingAbi = parseAbi([
  "function owner() view returns (address)",
  "function cliffStart() view returns (uint64)",
  "function cliffEnd() view returns (uint256)",
  "function vestingEnd() view returns (uint256)",
  "function released(address token) view returns (uint256)",
  "function vestedAmount(address token, uint64 timestamp) view returns (uint256)",
]);
const CALL_SCHEDULED = parseAbiItem(
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
);
const GOVERNANCE_EVENTS = [
  parseAbiItem("event MinDelayChange(uint256 oldDuration, uint256 newDuration)"),
  parseAbiItem(
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  ),
  parseAbiItem(
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  ),
] as const;
const STATES: OperationState[] = ["Unset", "Waiting", "Ready", "Done"];

/**
 * Public RPCs cap `eth_getLogs` ranges; scan in chunks of this many blocks (both ends included).
 * The free Base Sepolia endpoint (`https://sepolia.base.org`) refuses `toBlock - fromBlock > 200`,
 * so a chunk of 200 blocks (`toBlock - fromBlock = 199`) fits it with one block to spare.
 */
export const LOG_CHUNK = 200n;

/**
 * Splits `[fromBlock, toBlock]` (both included) into consecutive ranges of at most `size` blocks,
 * covering every block exactly once, in order.
 */
export function logRanges(
  fromBlock: bigint,
  toBlock: bigint,
  size: bigint = LOG_CHUNK,
): { fromBlock: bigint; toBlock: bigint }[] {
  if (size <= 0n) throw new MonitorError("log range size must be positive");
  if (fromBlock < 0n || fromBlock > toBlock) {
    throw new MonitorError("log range must satisfy 0 <= fromBlock <= toBlock");
  }
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += size) {
    const end = start + size - 1n;
    ranges.push({ fromBlock: start, toBlock: end < toBlock ? end : toBlock });
  }
  return ranges;
}

const roleName = (role: Hex) => Object.entries(ROLES).find(([, v]) => v === role)?.[0] ?? role;

/**
 * Reads a snapshot at the latest block. Timelock events are scanned from `fromBlock` (the
 * deployment block, or the block of the previous run) to that block.
 */
export async function readSnapshot(
  plan: DeployPlan,
  deployment: DeploymentRecord,
  rpcUrl: string,
  fromBlock: bigint,
): Promise<Snapshot> {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  if (chainId !== plan.chainId) {
    throw new MonitorError(
      `RPC chain ${String(chainId)} is not plan chain ${String(plan.chainId)}`,
    );
  }
  const block = await client.getBlock();
  const blockNumber = block.number;
  if (fromBlock > blockNumber) throw new MonitorError("fromBlock is after the latest block");
  const at = { blockNumber };
  const token = deployment.token as Address;
  const timelock = deployment.timelock as Address;

  const totalSupply = await client.readContract({
    ...at,
    address: token,
    abi: erc20Abi,
    functionName: "totalSupply",
  });
  const minDelay = await client.readContract({
    ...at,
    address: timelock,
    abi: timelockAbi,
    functionName: "getMinDelay",
  });
  const roles = new Map<string, boolean>();
  for (const r of expectedRoles(plan, deployment)) {
    roles.set(
      roleKey(r.role, r.account),
      await client.readContract({
        ...at,
        address: timelock,
        abi: timelockAbi,
        functionName: "hasRole",
        args: [ROLES[r.role], r.account as Address],
      }),
    );
  }

  const readVesting = async (wallet: Address): Promise<VestingState> => {
    const read = <F extends "owner" | "cliffStart" | "cliffEnd" | "vestingEnd">(functionName: F) =>
      client.readContract({ ...at, address: wallet, abi: vestingAbi, functionName });
    return {
      owner: await read("owner"),
      cliffStart: await read("cliffStart"),
      cliffEnd: await read("cliffEnd"),
      vestingEnd: await read("vestingEnd"),
      balance: await client.readContract({
        ...at,
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet],
      }),
      released: await client.readContract({
        ...at,
        address: wallet,
        abi: vestingAbi,
        functionName: "released",
        args: [token],
      }),
      vested: await client.readContract({
        ...at,
        address: wallet,
        abi: vestingAbi,
        functionName: "vestedAmount",
        args: [token, block.timestamp],
      }),
    };
  };

  const scheduled = new Map<Hex, TimelockOperation>();
  const governanceEvents: Snapshot["governanceEvents"] = [];
  // One eth_getLogs call per range, for every event the monitor reads.
  for (const range of logRanges(fromBlock, blockNumber)) {
    const logs = await client.getLogs({
      address: timelock,
      ...range,
      events: [CALL_SCHEDULED, ...GOVERNANCE_EVENTS],
    });
    for (const log of logs) {
      if (log.eventName === "CallScheduled") {
        const { id, target, value, data } = log.args;
        if (!id || !target || value === undefined || !data) continue;
        const op = scheduled.get(id) ?? { id, state: "Unset", readyAt: 0n, calls: [] };
        op.calls.push({ target, value, data });
        scheduled.set(id, op);
        continue;
      }
      // The constructor's grants (from the deploying account) and its initial delay (from 0)
      // are part of the deployment. Any later grant needs the admin role, which only the
      // timelock itself holds.
      if (log.eventName === "MinDelayChange" && log.args.oldDuration === 0n) continue;
      if (
        log.eventName === "RoleGranted" &&
        String(log.args.sender).toLowerCase() !== timelock.toLowerCase()
      ) {
        continue;
      }
      const detail =
        log.eventName === "MinDelayChange"
          ? `${String(log.args.oldDuration)} → ${String(log.args.newDuration)} seconds`
          : `${roleName(log.args.role as Hex)} ${String(log.args.account)} by ${String(log.args.sender)}`;
      governanceEvents.push({ event: log.eventName, detail, blockNumber: log.blockNumber });
    }
  }
  for (const op of scheduled.values()) {
    const state = await client.readContract({
      ...at,
      address: timelock,
      abi: timelockAbi,
      functionName: "getOperationState",
      args: [op.id],
    });
    op.state = STATES[state] ?? "Unset";
    const ts = await client.readContract({
      ...at,
      address: timelock,
      abi: timelockAbi,
      functionName: "getTimestamp",
      args: [op.id],
    });
    // getTimestamp is 1 for a done operation and 0 for unset or cancelled.
    op.readyAt = ts > 1n ? ts : 0n;
  }

  return {
    chainId,
    blockNumber,
    timestamp: block.timestamp,
    totalSupply,
    minDelay,
    roles,
    vesting: {
      investors: await readVesting(deployment.investorsVesting as Address),
      strategicPartnerships: await readVesting(deployment.partnershipsVesting as Address),
    },
    operations: [...scheduled.values()],
    governanceEvents,
  };
}
