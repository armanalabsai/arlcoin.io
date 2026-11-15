// Protocol event alerts (security hardening S-4): a read-only scan of the live jobs escrows,
// verified evaluators and staking contract for the events the owner must know about.
//
// - alert: needs a person now (a dispute to rule on, a slash, a refused refund, a dispute closed
//   without a ruling, a reputation write that failed);
// - info: normal activity worth a daily look (jobs funded, votes, stake changes, reward periods).
//
// Nothing here signs or sends a transaction. On-chain reads use viem (MIT).

import { createPublicClient, http, parseAbiItem, type AbiEvent, type Address } from "viem";
import { base } from "viem/chains";

export interface EventsConfig {
  chainId: number;
  /** ARLJobs escrows to watch. */
  jobs: Address[];
  /** ARLVerifiedEvaluator instances to watch. */
  evaluators: Address[];
  /** ARLStakingRewards. */
  staking: Address[];
}

export type Level = "alert" | "info";

interface Watched {
  kind: "jobs" | "evaluators" | "staking";
  event: AbiEvent;
  level: Level;
  /** What the owner must do, for alerts. */
  action?: string;
}

const ev = (s: string) => parseAbiItem(s) as AbiEvent;

export const WATCHED: readonly Watched[] = [
  {
    kind: "jobs",
    event: ev("event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)"),
    level: "info",
  },
  {
    kind: "jobs",
    event: ev(
      "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
    ),
    level: "info",
  },
  {
    kind: "evaluators",
    event: ev(
      "event Voted(uint256 indexed jobId, address indexed validator, bool approve, bytes32 deliverable, bytes32 evidence)",
    ),
    level: "info",
  },
  {
    kind: "evaluators",
    event: ev("event Staked(address indexed validator, uint256 amount)"),
    level: "info",
  },
  {
    kind: "evaluators",
    event: ev("event Unstaked(address indexed validator, uint256 amount)"),
    level: "info",
  },
  {
    kind: "evaluators",
    event: ev(
      "event Disputed(uint256 indexed jobId, address indexed challenger, bytes32 evidence)",
    ),
    level: "alert",
    action: "The arbiter Safe must rule (resolve) before arbiterDeadline(jobId).",
  },
  {
    kind: "evaluators",
    event: ev("event Slashed(uint256 indexed jobId, address indexed account, uint256 amount)"),
    level: "alert",
    action: "Check the job's votes and the ruling; tell the slashed validator why.",
  },
  {
    kind: "evaluators",
    event: ev("event FeedbackFailed(uint256 indexed jobId, uint256 agentId)"),
    level: "alert",
    action: "The ERC-8004 reputation write failed; check the registry.",
  },
  {
    kind: "evaluators",
    event: ev("event RefundDeferred(uint256 indexed jobId)"),
    level: "alert",
    action:
      "The token refused the client's refund; tell the client to use claimRefundTo after the deadline.",
  },
  {
    kind: "evaluators",
    event: ev("event DisputeExpired(uint256 indexed jobId)"),
    level: "alert",
    action: "A dispute closed without a ruling; the arbiter missed its deadline.",
  },
  {
    kind: "staking",
    event: ev("event Staked(address indexed user, uint256 amount)"),
    level: "info",
  },
  {
    kind: "staking",
    event: ev("event Withdrawn(address indexed user, uint256 amount)"),
    level: "info",
  },
  {
    kind: "staking",
    event: ev("event RewardAdded(uint256 reward, uint256 rewardRate, uint256 periodFinish)"),
    level: "info",
  },
];

export interface Finding {
  level: Level;
  event: string;
  contract: Address;
  block: string;
  tx: string;
  args: Record<string, string>;
  action?: string;
}

export interface EventsReport {
  fromBlock: string;
  toBlock: string;
  alerts: number;
  findings: Finding[];
}

/** Decoded log arguments as strings (bigints and booleans included), for JSON output. */
export function stringifyArgs(args: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (args && typeof args === "object" && !Array.isArray(args)) {
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) out[k] = String(v);
  }
  return out;
}

export interface LogLike {
  address: Address;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  args?: unknown;
}

export interface EventsClient {
  getBlockNumber(): Promise<bigint>;
  getLogs(p: {
    address: Address[];
    event: AbiEvent;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<LogLike[]>;
}

/** Every watched event from `fromBlock` to the head, in windows of at most `window` blocks. */
export async function scan(
  client: EventsClient,
  config: EventsConfig,
  fromBlock: bigint,
  window = 1_000n,
): Promise<EventsReport> {
  const head = await client.getBlockNumber();
  const findings: Finding[] = [];
  for (const w of WATCHED) {
    const addresses = config[w.kind];
    if (addresses.length === 0) continue;
    for (let from = fromBlock; from <= head; from += window) {
      const to = from + window - 1n < head ? from + window - 1n : head;
      const logs = await client.getLogs({
        address: addresses,
        event: w.event,
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        findings.push({
          level: w.level,
          event: w.event.name,
          contract: l.address,
          block: String(l.blockNumber ?? ""),
          tx: l.transactionHash ?? "",
          args: stringifyArgs(l.args),
          ...(w.action ? { action: w.action } : {}),
        });
      }
    }
  }
  findings.sort((a, b) => Number(BigInt(a.block || "0") - BigInt(b.block || "0")));
  return {
    fromBlock: String(fromBlock),
    toBlock: String(head),
    alerts: findings.filter((f) => f.level === "alert").length,
    findings,
  };
}

/** A Markdown summary for the workflow run page. */
export function summary(report: EventsReport): string {
  const lines = [
    `### ARL protocol events, blocks ${report.fromBlock} to ${report.toBlock}`,
    "",
    report.findings.length === 0
      ? "No events."
      : `${String(report.findings.length)} events, ${String(report.alerts)} alerts.`,
  ];
  for (const f of report.findings) {
    const args = Object.entries(f.args)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(
      `- ${f.level === "alert" ? "**ALERT**" : "info"} ${f.event} at ${f.contract} (block ${f.block}, tx ${f.tx}) ${args}${f.action ? ` — ${f.action}` : ""}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function clientFor(rpcUrl: string, chainId: number): EventsClient {
  if (chainId !== base.id) throw new Error(`unsupported chain ${String(chainId)}`);
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}
