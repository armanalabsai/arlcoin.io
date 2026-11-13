// The ARL node for n8n: escrowed jobs on Base Mainnet, paid in ARL or USDC. A workflow creates a
// job, agrees the budget, funds it (the approval is automatic), hands in the work and settles it,
// each as one operation. See packages/n8n-nodes-arl/README.md.

import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import {
  ArlJobError,
  ESCROWS,
  createJob,
  fundJob,
  getJob,
  parseJobId,
  setBudget,
  settleJob,
  submitWork,
  type Clients,
} from "../../jobs.ts";
import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "../../n8n.ts";

const withJobId = [
  "setBudget",
  "fund",
  "submit",
  "complete",
  "reject",
  "claimRefund",
  "get",
] as const;

export class Arl implements INodeType {
  description: INodeTypeDescription = {
    displayName: "ARL",
    name: "arl",
    icon: "file:arl.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Escrowed AI and agent jobs on Base, paid in ARL or USDC",
    defaults: { name: "ARL" },
    inputs: ["main"],
    outputs: ["main"],
    usableAsTool: true,
    credentials: [{ name: "arlWalletApi", required: true }],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "create",
        options: [
          {
            name: "Create Job",
            value: "create",
            action: "Create a job",
            description: "Post a job for a provider",
          },
          {
            name: "Set Budget",
            value: "setBudget",
            action: "Set the budget of a job",
            description: "Client or provider proposes the price",
          },
          {
            name: "Fund Job",
            value: "fund",
            action: "Fund a job",
            description: "Client escrows the budget (approves automatically)",
          },
          {
            name: "Submit Work",
            value: "submit",
            action: "Submit work for a job",
            description: "Provider hands in the result",
          },
          {
            name: "Complete Job",
            value: "complete",
            action: "Complete a job",
            description: "Evaluator accepts: the provider is paid",
          },
          {
            name: "Reject Job",
            value: "reject",
            action: "Reject a job",
            description: "Evaluator rejects: the client is refunded",
          },
          {
            name: "Claim Refund",
            value: "claimRefund",
            action: "Claim the refund of an expired job",
            description: "After the deadline, return the escrow to the client",
          },
          {
            name: "Get Job",
            value: "get",
            action: "Get a job",
            description: "Read a job and its status",
          },
        ],
      },
      {
        displayName: "Payment Token",
        name: "escrow",
        type: "options",
        default: "ARL",
        options: [
          { name: "ARL", value: "ARL" },
          { name: "USDC", value: "USDC" },
        ],
        description: "Which escrow holds the job: paid in ARL or in USDC",
      },
      {
        displayName: "Job ID",
        name: "jobId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: [...withJobId] } },
      },
      {
        displayName: "Provider Address",
        name: "provider",
        type: "string",
        default: "",
        required: true,
        placeholder: "0x…",
        description: "The wallet that does the work and is paid",
        displayOptions: { show: { operation: ["create"] } },
      },
      {
        displayName: "Evaluator Address",
        name: "evaluator",
        type: "string",
        default: "",
        placeholder: "Leave empty to approve the work yourself",
        description: "Who accepts or rejects the work. Empty means this wallet.",
        displayOptions: { show: { operation: ["create"] } },
      },
      {
        displayName: "Hours Until Deadline",
        name: "hours",
        type: "number",
        default: 24,
        typeOptions: { minValue: 1 },
        description: "After the deadline the escrow can only go back to the client",
        displayOptions: { show: { operation: ["create"] } },
      },
      {
        displayName: "Description",
        name: "description",
        type: "string",
        default: "",
        description: "What the job is (up to 1,024 bytes), or a link to a brief",
        displayOptions: { show: { operation: ["create"] } },
      },
      {
        displayName: "Amount",
        name: "amount",
        type: "string",
        default: "",
        required: true,
        placeholder: "10",
        description: "In token units: 10 means 10 ARL (or 10 USDC)",
        displayOptions: { show: { operation: ["setBudget"] } },
      },
      {
        displayName: "Deliverable",
        name: "deliverable",
        type: "string",
        default: "",
        required: true,
        description:
          "The result, a link to it, or its 32-byte hash. Text is hashed; only the hash goes on chain.",
        displayOptions: { show: { operation: ["submit"] } },
      },
      {
        displayName: "Reason",
        name: "reason",
        type: "string",
        default: "",
        description: "Optional note, hashed on chain",
        displayOptions: { show: { operation: ["complete", "reject"] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const creds = await this.getCredentials("arlWalletApi");
    const key = typeof creds.privateKey === "string" ? creds.privateKey.trim() : "";
    const rpcUrl = typeof creds.rpcUrl === "string" && creds.rpcUrl ? creds.rpcUrl : undefined;
    const account = privateKeyToAccount(key as Hex);
    const transport = http(rpcUrl ?? "https://mainnet.base.org");
    const clients = {
      publicClient: createPublicClient({ chain: base, transport }),
      walletClient: createWalletClient({ account, chain: base, transport }),
    } as unknown as Clients;

    const out: INodeExecutionData[] = [];
    const items = this.getInputData();
    for (let i = 0; i < items.length; i++) {
      try {
        const operation = String(this.getNodeParameter("operation", i));
        const token = String(this.getNodeParameter("escrow", i, "ARL"));
        if (token !== "ARL" && token !== "USDC") throw new ArlJobError("unknown payment token");
        const escrow = ESCROWS[token];
        const param = (name: string) => String(this.getNodeParameter(name, i, ""));
        let json: Record<string, unknown>;
        if (operation === "create") {
          json = await createJob(clients, escrow, {
            provider: param("provider"),
            evaluator: param("evaluator"),
            hoursUntilDeadline: Number(this.getNodeParameter("hours", i, 24)),
            description: param("description"),
          });
        } else {
          const jobId = parseJobId(param("jobId"));
          if (operation === "setBudget")
            json = await setBudget(clients, escrow, jobId, param("amount"));
          else if (operation === "fund") json = await fundJob(clients, escrow, jobId);
          else if (operation === "submit")
            json = await submitWork(clients, escrow, jobId, param("deliverable"));
          else if (
            operation === "complete" ||
            operation === "reject" ||
            operation === "claimRefund"
          )
            json = await settleJob(clients, escrow, jobId, operation, param("reason"));
          else if (operation === "get") json = { ...(await getJob(clients, escrow, jobId)) };
          else throw new ArlJobError(`unknown operation ${operation}`);
          if (operation !== "get") json = { jobId: jobId.toString(), ...json };
        }
        out.push({ json: { operation, ...json }, pairedItem: { item: i } });
      } catch (error) {
        const message =
          error instanceof Error ? (error.message.split("\n")[0] ?? error.message) : String(error);
        if (this.continueOnFail()) out.push({ json: { error: message }, pairedItem: { item: i } });
        else throw new ArlJobError(message);
      }
    }
    return [out];
  }
}
