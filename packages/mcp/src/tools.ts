// The ARL tools an agent can call. Checks are pure (@arl/protocol); reads go to a Base RPC at one
// block, which every answer names so it can be re-checked; transactions are prepared unsigned for
// the user's own wallet. No tool signs, sends or asks for a key.

import { getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";

import {
  BASE_MAINNET_TASK_DEPLOYMENTS,
  BUILTIN_POLICIES,
  checkEvidence,
  checkTaskAgainstPolicy,
  builtinPolicy,
  committedSpecHash,
  fundingTransactions,
  parsePolicy,
  parseTask,
  policyHash,
  prepareTask,
  taskHash,
  type EvidenceV2,
  type Policy,
  type TaskDeployment,
  type Token,
} from "../../protocol/src/index.ts";
import type { Tool } from "./server.ts";

/** The chain reads the tools need (a viem PublicClient satisfies it). */
export interface ChainReader {
  getChainId(): Promise<number>;
  /** The block at `blockNumber`, or the latest block when called without arguments. */
  getBlock(args?: { blockNumber: bigint }): Promise<{ number: bigint; timestamp: bigint }>;
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    blockNumber?: bigint;
  }): Promise<unknown>;
}

export interface ToolOptions {
  chain: ChainReader;
  /** Escrow and evaluator per token; Base Mainnet by default. */
  deployments?: Record<Token, TaskDeployment>;
}

const readAbi = parseAbi([
  "struct Job { uint256 id; address client; address provider; address evaluator; string description; uint256 budget; uint256 expiredAt; uint8 status; address hook; }",
  "function getJob(uint256 jobId) view returns (Job)",
  "struct Config { uint8 tier; uint8 threshold; uint64 voteWindow; uint64 challengeWindow; uint96 bond; uint256 providerAgentId; bytes32 specHash; address[] committee; }",
  "function getConfig(uint256 jobId) view returns (Config)",
  "struct Verdict { uint8 phase; bool providerApproved; uint8 approvals; uint8 rejections; uint8 topApprovals; uint64 voteEnds; uint64 challengeEnds; address challenger; uint256 bond; bytes32 deliverable; bytes32 voteHash; }",
  "function getVerdict(uint256 jobId) view returns (Verdict)",
  "function outcomesOf(uint256 agentId) view returns (uint64 approved, uint64 rejected)",
]);

const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"] as const;
const PHASES = [
  "None",
  "Configured",
  "Approved",
  "Rejected",
  "Disputed",
  "Finalized",
  "Released",
  "Failed",
] as const;

export class ToolInputError extends Error {
  override name = "ToolInputError";
}

function address(v: unknown, what: string): Address {
  if (typeof v !== "string" || !isAddress(v, { strict: false })) {
    throw new ToolInputError(`${what} must be an address`);
  }
  return getAddress(v);
}

function addresses(v: unknown, what: string): Address[] {
  if (!Array.isArray(v)) throw new ToolInputError(`${what} must be an array of addresses`);
  return v.map((a, i) => address(a, `${what}[${String(i)}]`));
}

const MAX_UINT256 = (1n << 256n) - 1n;

function jobId(v: unknown): bigint {
  const s = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : v;
  if (typeof s !== "string" || !/^[0-9]{1,78}$/.test(s)) {
    throw new ToolInputError("jobId must be a non-negative integer (a decimal string is safest)");
  }
  const n = BigInt(s);
  if (n > MAX_UINT256) throw new ToolInputError("jobId exceeds uint256");
  return n;
}

function agentId(v: unknown): bigint {
  const s = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : v;
  if (typeof s !== "string" || !/^[0-9]{1,78}$/.test(s)) {
    throw new ToolInputError("agentId must be a non-negative integer (a decimal string is safest)");
  }
  const n = BigInt(s);
  if (n > MAX_UINT256) throw new ToolInputError("agentId exceeds uint256");
  return n;
}

function token(v: unknown): Token {
  if (v !== "ARL" && v !== "USDC") throw new ToolInputError('token must be "ARL" or "USDC"');
  return v;
}

function text(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "") throw new ToolInputError(`${what} must be a string`);
  return v;
}

function optionalPolicy(v: unknown): Policy | undefined {
  return v === undefined ? undefined : parsePolicy(v);
}

const TASK = {
  type: "object",
  description:
    "An arl-task/1 document (spec/arl-task/v0.1.0 in github.com/armanalabsai/arlcoin.io)",
};
const POLICY = {
  type: "object",
  description: "The arl-policy/1 document the task names; omit for a built-in policy",
};
const ADDRESS = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };
const JOB_ID = { type: "string", pattern: "^[0-9]+$", description: "Job id, decimal" };
const AGENT_ID = {
  type: "string",
  pattern: "^[0-9]+$",
  description: "ERC-8004 agent id, decimal",
};
const TOKEN = { type: "string", enum: ["ARL", "USDC"], description: "The escrow's payment token" };

const OPEN_INPUT = {
  type: "object",
  properties: {
    task: TASK,
    taskUri: {
      type: "string",
      description: "https or ipfs URI where validators fetch the task document",
    },
    client: { ...ADDRESS, description: "The user's wallet: it signs and pays" },
    provider: { ...ADDRESS, description: "The agent or service doing the work" },
    committee: {
      type: "array",
      items: ADDRESS,
      description: "Staked validators, as many as the task's committee_size",
    },
    policy: POLICY,
  },
  required: ["task", "taskUri", "client", "provider", "committee"],
  additionalProperties: false,
};

export function arlTools(opts: ToolOptions): Tool[] {
  const deployments = opts.deployments ?? BASE_MAINNET_TASK_DEPLOYMENTS;

  /** Chain id and latest block, read once per call so every answer names its block. */
  async function head(): Promise<{ chainId: number; block: bigint; timestamp: bigint }> {
    // One round trip: the chain id and the latest block are asked for together. Asking for the
    // block number first and its block second cost every read a third of its time.
    const [chainId, b] = await Promise.all([opts.chain.getChainId(), opts.chain.getBlock()]);
    const deploymentChain = deployments.ARL.chainId;
    if (chainId !== deploymentChain) {
      throw new Error(`the RPC is on chain ${String(chainId)}, not ${String(deploymentChain)}`);
    }
    return { chainId, block: b.number, timestamp: b.timestamp };
  }

  function prepare(args: Record<string, unknown>, now: bigint) {
    const task = args.task;
    const raw = (task as { payment?: { token?: unknown } } | null)?.payment?.token;
    const deployment = deployments[token(raw)];
    const policy = optionalPolicy(args.policy);
    return prepareTask({
      task,
      taskUri: text(args.taskUri, "taskUri"),
      client: address(args.client, "client"),
      provider: address(args.provider, "provider"),
      committee: addresses(args.committee, "committee"),
      deployment,
      now,
      ...(policy ? { policy } : {}),
    });
  }

  return [
    {
      name: "arl_check_task",
      description:
        "Validate an arl-task/1 task and check it against its arl-policy/1 policy. Returns the task hash, the hash committed on chain, and the policy verdict. Reads nothing from the chain.",
      inputSchema: {
        type: "object",
        properties: { task: TASK, policy: POLICY },
        required: ["task"],
        additionalProperties: false,
      },
      run(args) {
        const task = parseTask(args.task);
        const policy = optionalPolicy(args.policy) ?? builtinPolicy(task.verification.policy);
        let policyCheck = "unknown policy: pass the policy document to check it";
        if (policy) {
          try {
            checkTaskAgainstPolicy(task, policy);
            policyCheck = "ok";
          } catch (e) {
            policyCheck = e instanceof Error ? e.message : String(e);
          }
        }
        return Promise.resolve({
          valid: true,
          taskHash: taskHash(task),
          committedSpecHash: committedSpecHash(task),
          policy: task.verification.policy,
          policyCheck,
        });
      },
    },
    {
      name: "arl_list_policies",
      description:
        "The built-in arl-policy/1 verification policies with their hashes: which workload classes, tiers, committee sizes, windows and evidence each allows.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run() {
        return Promise.resolve(
          [...BUILTIN_POLICIES.values()].map((p) => ({
            ref: `arl-policy/1:${p.id}`,
            hash: policyHash(p),
            policy: p,
          })),
        );
      },
    },
    {
      name: "arl_get_job",
      description:
        "Read a verified job on the ARL escrow (ARL or USDC) on Base Mainnet: status, client, provider, budget, deadline, committee configuration and the committee's verdict, all at one block that the answer names.",
      inputSchema: {
        type: "object",
        properties: { token: TOKEN, jobId: JOB_ID },
        required: ["token", "jobId"],
        additionalProperties: false,
      },
      async run(args) {
        const d = deployments[token(args.token)];
        const id = jobId(args.jobId);
        const { chainId, block } = await head();
        const at = { blockNumber: block };
        const job = (await opts.chain.readContract({
          address: d.jobs,
          abi: readAbi,
          functionName: "getJob",
          args: [id],
          ...at,
        })) as {
          id: bigint;
          client: Address;
          provider: Address;
          evaluator: Address;
          description: string;
          budget: bigint;
          expiredAt: bigint;
          status: number;
        };
        if (job.id === 0n) throw new ToolInputError(`job ${id.toString()} does not exist`);
        const verified = job.evaluator.toLowerCase() === d.evaluator.toLowerCase();
        const out: Record<string, unknown> = {
          chainId,
          block,
          jobs: d.jobs,
          jobId: id,
          status: JOB_STATUS[job.status] ?? `Status ${String(job.status)}`,
          client: job.client,
          provider: job.provider,
          evaluator: job.evaluator,
          description: job.description,
          budget: job.budget,
          token: args.token,
          expiredAt: job.expiredAt,
          verified,
        };
        if (verified) {
          const [config, verdict] = await Promise.all([
            opts.chain.readContract({
              address: d.evaluator,
              abi: readAbi,
              functionName: "getConfig",
              args: [id],
              ...at,
            }),
            opts.chain.readContract({
              address: d.evaluator,
              abi: readAbi,
              functionName: "getVerdict",
              args: [id],
              ...at,
            }),
          ]);
          const v = verdict as { phase: number };
          out.config = config;
          out.verdict = { ...v, phaseName: PHASES[v.phase] ?? `Phase ${String(v.phase)}` };
        }
        return out;
      },
    },
    {
      name: "arl_get_agent_outcomes",
      description:
        "Read an agent's verified record on Base Mainnet: how many of its jobs the ARL and the USDC verified evaluators approved and rejected. The evaluators keep these counts themselves (outcomesOf), so a reputation registry refusing a write cannot erase them. Read at one block that the answer names.",
      inputSchema: {
        type: "object",
        properties: { agentId: AGENT_ID },
        required: ["agentId"],
        additionalProperties: false,
      },
      async run(args) {
        const id = agentId(args.agentId);
        const { chainId, block } = await head();
        const tokens: Token[] = ["ARL", "USDC"];
        const reads = await Promise.all(
          tokens.map((t) =>
            opts.chain.readContract({
              address: deployments[t].evaluator,
              abi: readAbi,
              functionName: "outcomesOf",
              args: [id],
              blockNumber: block,
            }),
          ),
        );
        let approved = 0n;
        let rejected = 0n;
        const byToken: Record<string, unknown> = {};
        tokens.forEach((t, i) => {
          const [a, r] = reads[i] as readonly [bigint, bigint];
          approved += a;
          rejected += r;
          byToken[t] = { evaluator: deployments[t].evaluator, approved: a, rejected: r };
        });
        return { chainId, block, agentId: id, approved, rejected, byToken };
      },
    },
    {
      name: "arl_check_evidence",
      description:
        "Check an arl-evidence/2 package offline: that the on-chain settlement record, the task, the proof and the policy agree. Returns the outcome and the vote counts.",
      inputSchema: {
        type: "object",
        properties: {
          evidence: { type: "object", description: "An arl-evidence/2 document" },
        },
        required: ["evidence"],
        additionalProperties: false,
      },
      run(args) {
        return Promise.resolve(checkEvidence(args.evidence as EvidenceV2));
      },
    },
    {
      name: "arl_prepare_job",
      description:
        "Step 1 of opening a task as a verified job: validates the task against its policy and returns the unsigned createJob transaction for the user's own wallet (the client) to sign and send on Base Mainnet. Read the jobId from the JobCreated event of its receipt, then call arl_prepare_funding.",
      inputSchema: OPEN_INPUT,
      async run(args) {
        const { chainId, block, timestamp } = await head();
        const p = prepare(args, timestamp);
        return {
          chainId,
          block,
          taskHash: p.taskHash,
          policy: `arl-policy/1:${p.policy.id}`,
          budget: p.terms.budget,
          token: p.task.payment.token,
          expiredAt: p.terms.createJob.expiredAt,
          transactions: [p.create],
          next: "Send it from the client wallet; the JobCreated event of the receipt holds the jobId. Then call arl_prepare_funding with the same arguments and that jobId.",
        };
      },
    },
    {
      name: "arl_prepare_funding",
      description:
        "Step 2 of opening a task: for the jobId created in step 1, returns the unsigned configure, setBudget, approve and fund transactions, in order, for the client wallet. Pass the same arguments as arl_prepare_job.",
      inputSchema: {
        ...OPEN_INPUT,
        properties: { ...OPEN_INPUT.properties, jobId: JOB_ID },
        required: [...OPEN_INPUT.required, "jobId"],
      },
      async run(args) {
        const id = jobId(args.jobId);
        const { chainId, block, timestamp } = await head();
        const p = prepare(args, timestamp);
        const job = (await opts.chain.readContract({
          address: p.deployment.jobs,
          abi: readAbi,
          functionName: "getJob",
          args: [id],
          blockNumber: block,
        })) as {
          id: bigint;
          client: Address;
          provider: Address;
          evaluator: Address;
          description: string;
        };
        // An RPC behind the createJob receipt reads an empty job: say so, so callers can retry.
        if (job.id === 0n) throw new ToolInputError(`job ${id.toString()} does not exist`);
        // The job must be the one step 1 created for this task, or the funds would go elsewhere.
        const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
        if (
          !same(job.client, address(args.client, "client")) ||
          !same(job.provider, p.terms.createJob.provider) ||
          !same(job.evaluator, p.deployment.evaluator) ||
          job.description !== p.terms.createJob.description
        ) {
          throw new ToolInputError(
            `job ${id.toString()} is not this task's job: its client, provider, evaluator or description differ`,
          );
        }
        return {
          chainId,
          block,
          jobId: id,
          taskHash: p.taskHash,
          transactions: fundingTransactions(p, id),
          next: "Send them in order from the client wallet. The provider then calls approveCommittee on the evaluator; the committee members accept and vote.",
        };
      },
    },
  ];
}

export type { Hex };
