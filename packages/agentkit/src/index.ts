// ARL Protocol actions for Coinbase AgentKit (github.com/coinbase/agentkit).
//
//   import { AgentKit, customActionProvider } from "@coinbase/agentkit";
//   import { z } from "zod";
//   import { arlActions } from "@arl/agentkit";
//
//   const agentkit = await AgentKit.from({
//     walletProvider, // any EVM wallet provider on Base Mainnet
//     actionProviders: [customActionProvider(arlActions(z))],
//   });
//
// The read actions are the MCP server's tools (packages/mcp): the same checks, the same answers.
// arl_open_task signs from the agent's own wallet, through its wallet provider, exactly the
// transactions arl_prepare_job and arl_prepare_funding return; nothing here holds a key. Pass the
// `z` your AgentKit setup uses, so the schemas are the zod version it expects.

import { decodeEventLog, type Address, type Hex } from "viem";

import {
  BASE_MAINNET_TASK_DEPLOYMENTS,
  openTaskAbi,
  type TaskDeployment,
  type Token,
} from "../../protocol/src/index.ts";
import { arlTools, type ChainReader } from "../../mcp/src/tools.ts";

/** The part of AgentKit's EvmWalletProvider these actions use. */
export interface ArlWalletProvider {
  getAddress(): string;
  sendTransaction(tx: { to: Address; data: Hex; value?: bigint }): Promise<Hex>;
  waitForTransactionReceipt(hash: Hex): Promise<unknown>;
  getPublicClient(): unknown;
}

/** One action, in the shape AgentKit's customActionProvider takes. */
export interface ArlAction {
  name: string;
  description: string;
  schema: unknown;
  // Two parameters: AgentKit passes the wallet provider only to an invoke that declares both.
  invoke(walletProvider: ArlWalletProvider, args: Record<string, unknown>): Promise<string>;
}

interface Described {
  describe(description: string): unknown;
}

/** The zod builders the schemas use; zod 3 and zod 4 both provide them. */
export interface Zod {
  object(shape: Record<string, unknown>): unknown;
  string(): Described & { regex(pattern: RegExp): Described };
  array(item: never): Described;
  record(key: never, value: never): Described & { optional(): unknown };
  unknown(): unknown;
  enum(values: readonly [string, ...string[]]): Described;
}

export interface ArlActionOptions {
  /** Escrow and evaluator per token; Base Mainnet by default. */
  deployments?: Record<Token, TaskDeployment>;
  /** Wait between attempts while the RPC catches up with a new job, in ms. */
  retryDelayMs?: number;
}

export class ArlActionError extends Error {
  override name = "ArlActionError";
}

type Tx = { step: string; to: Address; data: Hex };
type Log = { address: string; topics: [Hex, ...Hex[]]; data: Hex };

/** JSON for the model, with bigints as decimal strings. */
function answer(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

function jobIdFrom(logs: Log[], jobs: Address): bigint | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== jobs.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: openTaskAbi, eventName: "JobCreated", ...log });
      return ev.args.jobId;
    } catch {
      // another event of the escrow
    }
  }
  return undefined;
}

export function arlActions(z: Zod, opts: ArlActionOptions = {}): ArlAction[] {
  const deployments = opts.deployments ?? BASE_MAINNET_TASK_DEPLOYMENTS;
  const retryDelayMs = opts.retryDelayMs ?? 2000;

  async function run(wp: ArlWalletProvider, name: string, args: Record<string, unknown>) {
    const chain = wp.getPublicClient() as ChainReader;
    const tool = arlTools({ chain, deployments }).find((t) => t.name === name);
    if (!tool) throw new ArlActionError(`no tool ${name}`);
    return tool.run(args);
  }

  const address = () => z.string().regex(/^0x[0-9a-fA-F]{40}$/);
  const doc = (what: string) => z.record(z.string() as never, z.unknown() as never).describe(what);
  const task = () =>
    doc("An arl-task/1 document (spec/arl-task/v0.1.0 in github.com/armanalabsai/arlcoin.io)");
  const policy = () => z.record(z.string() as never, z.unknown() as never).optional();

  const readOnly = (
    name: string,
    description: string,
    shape: Record<string, unknown>,
  ): ArlAction => ({
    name,
    description,
    schema: z.object(shape),
    async invoke(walletProvider, args) {
      return answer(await run(walletProvider, name, args));
    },
  });

  const openTask: ArlAction = {
    name: "arl_open_task",
    description:
      "Open an arl-task/1 task as a verified job on Base Mainnet, paid from this wallet: validates the task against its policy, then creates the job and configures, budgets, approves and funds it (five transactions). The wallet needs the budget in the task's token (ARL or USDC) and ETH for gas. The provider then approves the committee and the validators check the work.",
    schema: z.object({
      task: task(),
      taskUri: z
        .string()
        .describe("https or ipfs URI where validators fetch the same task document"),
      provider: address().describe("The agent or service doing the work"),
      committee: z
        .array(address() as never)
        .describe("Staked validators, as many as the task's committee_size"),
      policy: policy(),
    }),
    async invoke(walletProvider, args) {
      const input = { ...args, client: walletProvider.getAddress() };
      // Validates the task and its policy; throws before anything is sent.
      const prepared = (await run(walletProvider, "arl_prepare_job", input)) as {
        taskHash: Hex;
        token: Token;
        transactions: Tx[];
      };
      const create = prepared.transactions[0];
      if (!create) throw new ArlActionError("no createJob transaction was prepared");
      const jobs = deployments[prepared.token].jobs;

      const sent: Record<string, Hex> = {};
      const send = async (tx: Tx): Promise<Log[]> => {
        const hash = await walletProvider.sendTransaction({ to: tx.to, data: tx.data, value: 0n });
        const receipt = (await walletProvider.waitForTransactionReceipt(hash)) as {
          status?: string;
          logs?: Log[];
        };
        if (receipt.status !== "success") throw new ArlActionError(`${tx.step} reverted: ${hash}`);
        sent[tx.step] = hash;
        return receipt.logs ?? [];
      };

      const jobId = jobIdFrom(await send(create), jobs);
      if (jobId === undefined) {
        throw new ArlActionError("the job was created but its id could not be read");
      }

      // The RPC can lag a block behind the new job. The funding step refuses a job that is not
      // this task's, so retrying it is safe.
      let funding: { transactions: Tx[] } | undefined;
      for (let attempt = 1; funding === undefined; attempt++) {
        try {
          funding = (await run(walletProvider, "arl_prepare_funding", {
            ...input,
            jobId: jobId.toString(),
          })) as { transactions: Tx[] };
        } catch (e) {
          if (attempt >= 5) throw e;
          await new Promise((r) => setTimeout(r, retryDelayMs));
        }
      }
      for (const tx of funding.transactions) await send(tx);
      return answer({
        jobId,
        taskHash: prepared.taskHash,
        token: prepared.token,
        escrow: jobs,
        transactions: sent,
        next: "The provider approves the committee on the evaluator; the validators accept, check the work and vote.",
      });
    },
  };

  return [
    readOnly(
      "arl_check_task",
      "Validate an arl-task/1 task and check it against its arl-policy/1 policy. Returns the task hash, the hash committed on chain and the policy verdict. Sends nothing.",
      { task: task(), policy: policy() },
    ),
    readOnly(
      "arl_list_policies",
      "List the built-in arl-policy/1 verification policies with their hashes: the workload classes, tiers, committee sizes, windows and evidence each allows.",
      {},
    ),
    readOnly(
      "arl_get_job",
      "Read a job on the ARL escrow (ARL or USDC) on Base Mainnet: status, parties, budget, deadline and, for a verified job, the committee and its verdict, at one block the answer names.",
      {
        token: z.enum(["ARL", "USDC"]).describe("The escrow's payment token"),
        jobId: z
          .string()
          .regex(/^[0-9]+$/)
          .describe("Job id, decimal"),
      },
    ),
    readOnly(
      "arl_check_evidence",
      "Check an arl-evidence/2 package offline: that the settlement record, the task, the proof and the policy agree. Returns the outcome and the vote counts.",
      { evidence: doc("An arl-evidence/2 document") },
    ),
    openTask,
  ];
}
