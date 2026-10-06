// Deploy screen: signs a prepared ARL deployment from a phone wallet, one transaction at a time.
//
// The transactions come from a Foundry dry run (`forge script … --sender <your address>` without
// `--broadcast`), which writes `broadcast/<Script>/<chain>/dry-run/run-latest.json`. Nothing here
// creates, stores or asks for a key: the wallet signs each transaction itself.
//
// A run file is untrusted input. Before a transaction is offered for signing it must be one of:
// - a contract creation whose code is exactly the ARL build (`DEPLOY_ARTIFACTS`), with its
//   constructor arguments decoded for display;
// - a Safe creation through the canonical Safe v1.5.0 SafeProxyFactory with a canonical
//   singleton (on Base Sepolia), with its owners and threshold decoded for display.
// Anything else is refused. The chain must be Base Sepolia (or the local Anvil chain); Base
// Mainnet is refused by `assertAllowedChain` before the TGE.

import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  getContractAddress,
  isAddress,
  keccak256,
  parseAbi,
  slice,
  type Address,
  type Hex,
} from "viem";

import { DEPLOY_ARTIFACTS } from "./deployArtifacts.ts";
import { BASE_MAINNET_CHAIN_ID, LOCAL_CHAIN_ID, assertAllowedChain } from "./network.ts";

/** Canonical Safe v1.5.0 contracts (safe-global/safe-deployments), as pinned in CreateSafes. */
export const SAFE_FACTORY_V150: Address = "0x14F2982D601c9458F93bd70B218933A6f8165e7b";
export const SAFE_SINGLETONS_V150: readonly Address[] = [
  "0xFf51A5898e281Db6DfC7855790607438dF2ca44b",
  "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e",
];

const factoryAbi = parseAbi([
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address)",
]);
const safeAbi = parseAbi([
  "function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
]);

export type DeployStep =
  | {
      kind: "create";
      index: number;
      contract: keyof typeof DEPLOY_ARTIFACTS;
      /** Where the contract will be created (from the sender and nonce). */
      address: Address;
      from: Address;
      nonce: number;
      data: Hex;
      gas?: bigint;
      args: readonly unknown[];
    }
  | {
      kind: "safe";
      index: number;
      factory: Address;
      singleton: Address;
      owners: Address[];
      threshold: bigint;
      /** The Safe proxy the dry run created. */
      safe?: Address;
      from: Address;
      nonce: number;
      data: Hex;
      gas?: bigint;
    };

export interface DeployRun {
  chainId: number;
  from: Address;
  steps: DeployStep[];
}

export class DeployRunError extends Error {
  override name = "DeployRunError";
}

function fail(message: string): never {
  throw new DeployRunError(message);
}

const hexNumber = (v: unknown, field: string): number => {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]+$/.test(v)) fail(`${field} is not a hex number`);
  return Number(BigInt(v));
};

const isHex = (v: unknown): v is Hex => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);

interface ForgeTransaction {
  transactionType?: unknown;
  contractName?: unknown;
  contractAddress?: unknown;
  additionalContracts?: { address?: unknown }[];
  transaction?: {
    from?: unknown;
    to?: unknown;
    input?: unknown;
    value?: unknown;
    nonce?: unknown;
    gas?: unknown;
    chainId?: unknown;
  };
}

/** Reads and checks a Foundry dry-run file. Throws on anything that is not an ARL deployment. */
export function parseRun(json: unknown): DeployRun {
  const run = json as { transactions?: unknown; chain?: unknown };
  if (!Array.isArray(run.transactions) || run.transactions.length === 0) {
    fail("the file has no transactions");
  }
  const chainId = typeof run.chain === "number" ? run.chain : fail("the file has no chain id");
  assertAllowedChain(chainId);

  let from: Address | undefined;
  let nextNonce: number | undefined;
  const steps = (run.transactions as ForgeTransaction[]).map((t, index): DeployStep => {
    const tx = t.transaction ?? fail(`transaction ${String(index + 1)}: missing`);
    if (tx.chainId !== undefined && hexNumber(tx.chainId, "chainId") !== chainId) {
      fail(`transaction ${String(index + 1)}: another chain`);
    }
    if (typeof tx.from !== "string" || !isAddress(tx.from)) fail("a transaction has no sender");
    const sender = getAddress(tx.from);
    from ??= sender;
    if (sender !== from) fail(`transaction ${String(index + 1)}: another sender`);
    if (tx.value !== undefined && hexNumber(tx.value, "value") !== 0) {
      fail(`transaction ${String(index + 1)}: sends ETH`);
    }
    const nonce = hexNumber(tx.nonce, "nonce");
    if (nextNonce !== undefined && nonce !== nextNonce) {
      fail(`transaction ${String(index + 1)}: nonces are not consecutive`);
    }
    nextNonce = nonce + 1;
    if (!isHex(tx.input) || tx.input.length <= 2) fail(`transaction ${String(index + 1)}: no data`);
    const gas = tx.gas === undefined ? undefined : BigInt(hexNumber(tx.gas, "gas"));
    const base = { index, from, nonce, data: tx.input, gas };

    if (t.transactionType === "CREATE") {
      if (tx.to !== null && tx.to !== undefined)
        fail(`transaction ${String(index + 1)}: not a creation`);
      const name = t.contractName;
      if (typeof name !== "string" || !(name in DEPLOY_ARTIFACTS)) {
        fail(`transaction ${String(index + 1)}: creates an unknown contract`);
      }
      const contract = name as keyof typeof DEPLOY_ARTIFACTS;
      const artifact = DEPLOY_ARTIFACTS[contract];
      const size = artifact.creationSize;
      if ((tx.input.length - 2) / 2 < size)
        fail(`transaction ${String(index + 1)}: code too short`);
      if (keccak256(slice(tx.input, 0, size)) !== artifact.creationHash) {
        fail(`transaction ${String(index + 1)}: ${contract} code is not the ARL build`);
      }
      const rest = (tx.input.length - 2) / 2 === size ? "0x" : slice(tx.input, size);
      let args: readonly unknown[];
      try {
        args = decodeAbiParameters(artifact.constructorInputs as never, rest);
      } catch {
        fail(`transaction ${String(index + 1)}: unreadable ${contract} arguments`);
      }
      const address = getContractAddress({ from, nonce: BigInt(nonce) });
      if (typeof t.contractAddress === "string" && getAddress(t.contractAddress) !== address) {
        fail(`transaction ${String(index + 1)}: address does not follow from sender and nonce`);
      }
      return { kind: "create", contract, address, args, ...base };
    }

    if (t.transactionType === "CALL") {
      if (typeof tx.to !== "string" || !isAddress(tx.to))
        fail(`transaction ${String(index + 1)}: no target`);
      const factory = getAddress(tx.to);
      if (chainId !== LOCAL_CHAIN_ID && factory !== SAFE_FACTORY_V150) {
        fail(`transaction ${String(index + 1)}: calls a contract that is not the Safe factory`);
      }
      let singleton: Address;
      let initializer: Hex;
      try {
        const call = decodeFunctionData({ abi: factoryAbi, data: tx.input });
        [singleton, initializer] = [call.args[0], call.args[1]];
      } catch {
        fail(`transaction ${String(index + 1)}: not a Safe creation`);
      }
      if (chainId !== LOCAL_CHAIN_ID && !SAFE_SINGLETONS_V150.includes(getAddress(singleton))) {
        fail(`transaction ${String(index + 1)}: not a canonical Safe v1.5.0 singleton`);
      }
      let owners: readonly Address[];
      let threshold: bigint;
      try {
        const setup = decodeFunctionData({ abi: safeAbi, data: initializer });
        [owners, threshold] = [setup.args[0], setup.args[1]];
      } catch {
        fail(`transaction ${String(index + 1)}: unreadable Safe setup`);
      }
      if (threshold < 1n || threshold > BigInt(owners.length)) {
        fail(`transaction ${String(index + 1)}: Safe threshold out of range`);
      }
      const created = t.additionalContracts?.[0]?.address;
      return {
        kind: "safe",
        factory,
        singleton: getAddress(singleton),
        owners: owners.map((o) => getAddress(o)),
        threshold,
        safe: typeof created === "string" && isAddress(created) ? getAddress(created) : undefined,
        ...base,
      };
    }
    fail(`transaction ${String(index + 1)}: unsupported type`);
  });
  return { chainId, from: from ?? fail("no sender"), steps };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const date = (s: unknown) => new Date(Number(s) * 1000).toISOString().slice(0, 10);

/** What a step does, in one or two plain sentences, shown before it is signed. */
export function describeStep(step: DeployStep): { title: string; detail: string } {
  if (step.kind === "safe") {
    return {
      title: `Create a Safe (${String(step.threshold)} of ${String(step.owners.length)})`,
      detail: `Creates a Safe multisig owned by ${step.owners.map(short).join(", ")}; ${String(step.threshold)} of them must sign each of its transactions. No tokens move and your address gets no role.`,
    };
  }
  const a = step.args;
  switch (step.contract) {
    case "ARLVestingWallet":
      return {
        title: "Create a vesting wallet",
        detail: `Creates a vesting wallet for ${short(String(a[0]))}: nothing vests before ${date(a[2])}, then linearly until ${date(a[3])} (grant date ${date(a[1])}). It holds no tokens until the token is created.`,
      };
    case "ARLTimelock":
      return {
        title: "Create the treasury timelock",
        detail: `Creates the treasury timelock with a delay of ${String(Number(a[0]) / 3600)} hours. Proposer and executor: ${(a[1] as string[]).map(short).join(", ")}; cancel-only guardian: ${short(String(a[3]))}.`,
      };
    case "ARLToken":
      return {
        title: "Create the ARL token",
        detail:
          "Creates the ARL token and mints the fixed 21,000,000 ARL once, to the eleven allocation holders. Nothing is minted to your address and the token has no owner.",
      };
  }
}

/**
 * Path of a prepared run published with the app (under `public/plans/`), selected with
 * `?plan=<name>`. Only plain names are accepted, so the file always comes from this site; its
 * content is still untrusted and goes through `parseRun`.
 */
export function publishedPlanPath(name: string, basePath = ""): string {
  if (!/^[a-z0-9-]{1,64}$/.test(name)) fail("the plan name is not valid");
  return `${basePath}/plans/${name}.json`;
}

/** Checks the connected wallet against a step just before it is sent. */
export function checkBeforeSend(
  step: DeployStep,
  wallet: { account: Address; chainId: number; nonce: number },
  runChainId: number,
): string | undefined {
  if (wallet.chainId !== runChainId) {
    return `switch the wallet to ${runChainId === LOCAL_CHAIN_ID ? "the local chain" : runChainId === BASE_MAINNET_CHAIN_ID ? "Base" : "Base Sepolia"}`;
  }
  if (getAddress(wallet.account) !== step.from) {
    return `connect ${short(step.from)}: this plan was prepared for that address`;
  }
  if (wallet.nonce !== step.nonce) {
    return `the wallet's next transaction is #${String(wallet.nonce)}, the plan expects #${String(step.nonce)}; the plan must be prepared again`;
  }
  return undefined;
}
