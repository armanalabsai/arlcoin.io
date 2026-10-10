// The testnet operator's server side (Base Sepolia only). Its key comes from ARL_OPERATOR_KEY in
// the host's environment and never reaches the browser. Each action checks the chain first and
// sends at most one transaction; see lib/operatorRules.ts for the request rules.
import "server-only";

import { ArlUptoFacilitator, InMemoryAuthorizationStore } from "@arl/payments";
import { createGroup } from "@arl/zk";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { UptoEvmScheme as UptoFacilitator } from "@x402/evm/upto/facilitator";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  isAddressEqual,
  parseAbi,
  publicActions,
  type Address,
  type Hex,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";

import { ARL, ARL_CHAIN_ID, deployBlock } from "~~/lib/contracts";
import { eventsSince, readRange } from "~~/lib/logs";
import { BASE_SEPOLIA_CHAIN_ID } from "~~/lib/network";
import {
  FAUCET_AMOUNT,
  FAUCET_WINDOW_BLOCKS,
  OperatorRequestError,
  faucetDecision,
  joinMessage,
  type RelayRequest,
  type SettleRequest,
} from "~~/lib/operatorRules";
import { DEMO_GROUP } from "~~/lib/poll";
import scaffoldConfig from "~~/scaffold.config";

const chain = scaffoldConfig.targetNetworks[0];
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const SIGNAL = ARL.ARLAnonymousSignal;
const TOKEN = ARL.ARLToken;

/** The operator, or a 503 when this deployment has none (local builds, missing key). */
function operator() {
  if (ARL_CHAIN_ID !== BASE_SEPOLIA_CHAIN_ID)
    throw new OperatorRequestError("the operator runs on Base Sepolia only", 503);
  const key = process.env.ARL_OPERATOR_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new OperatorRequestError("the operator is not configured", 503);
  const account = privateKeyToAccount(key as Hex, { nonceManager });
  const transport = fallback(chain.rpcUrls.default.http.map((url) => http(url)));
  const wallet = createWalletClient({ account, chain, transport }).extend(publicActions);
  const reader = createPublicClient({ chain, transport });
  return { account, wallet, reader };
}

let cached: ReturnType<typeof operator> | undefined;
const op = () => (cached ??= operator());

const ETH_DRIP = (() => {
  const v = process.env.ARL_FAUCET_ETH_WEI;
  return v && /^[0-9]{1,20}$/.test(v) ? BigInt(v) : 0n;
})();

export async function status() {
  const { account, reader } = op();
  const [eth, arl] = await Promise.all([
    reader.getBalance({ address: account.address }),
    reader.readContract({
      address: TOKEN.address,
      abi: erc20,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);
  return {
    chainId: ARL_CHAIN_ID,
    operator: account.address,
    eth: eth.toString(),
    arl: arl.toString(),
    faucetAmount: FAUCET_AMOUNT.toString(),
    ethDrip: ETH_DRIP.toString(),
  };
}

export async function faucet(account: Address) {
  const { account: me, wallet, reader } = op();
  if (isAddressEqual(account, me.address)) throw new OperatorRequestError("not the operator");
  const latest = await reader.getBlockNumber();
  const since = latest > FAUCET_WINDOW_BLOCKS ? latest - FAUCET_WINDOW_BLOCKS : 0n;
  const [balance, operatorBalance, recent, eth] = await Promise.all([
    reader.readContract({
      address: TOKEN.address,
      abi: erc20,
      functionName: "balanceOf",
      args: [account],
    }),
    reader.readContract({
      address: TOKEN.address,
      abi: erc20,
      functionName: "balanceOf",
      args: [me.address],
    }),
    readRange({ fromBlock: since, toBlock: latest }, (range) =>
      reader.getLogs({
        address: TOKEN.address,
        event: erc20[2],
        args: { from: me.address, to: account },
        ...range,
      }),
    ),
    reader.getBalance({ address: account }),
  ]);
  const decision = faucetDecision({ balance, paidRecently: recent.length > 0, operatorBalance });
  if (!decision.ok) throw new OperatorRequestError(decision.reason, 429);
  const hash = await wallet.writeContract({
    address: TOKEN.address,
    abi: erc20,
    functionName: "transfer",
    args: [account, FAUCET_AMOUNT],
  });
  let ethHash: Hex | undefined;
  if (ETH_DRIP > 0n && eth < ETH_DRIP) {
    ethHash = await wallet.sendTransaction({ to: account, value: ETH_DRIP });
  }
  await reader.waitForTransactionReceipt({ hash });
  return { transaction: hash, ethTransaction: ethHash, amount: FAUCET_AMOUNT.toString() };
}

/** The demo group's published members, in order, and whether they rebuild the stored root. */
async function demoGroup() {
  const { reader } = op();
  const count = await reader.readContract({
    address: SIGNAL.address,
    abi: SIGNAL.abi,
    functionName: "groupCount",
  });
  if (count === 0n) return { exists: false as const, members: [] as bigint[] };
  const [events, root] = await Promise.all([
    eventsSince(reader, deployBlock(SIGNAL), (range) =>
      reader.getContractEvents({
        address: SIGNAL.address,
        abi: SIGNAL.abi,
        eventName: "MembersAdded",
        args: { groupId: DEMO_GROUP },
        ...range,
      }),
    ),
    reader.readContract({
      address: SIGNAL.address,
      abi: SIGNAL.abi,
      functionName: "groupRoot",
      args: [DEMO_GROUP],
    }),
  ]);
  const members = events.flatMap((e) => [...(e.args.commitments ?? [])]);
  if (createGroup(members).root !== root)
    throw new OperatorRequestError("the demo group's published members do not match its root", 500);
  return { exists: true as const, members };
}

export async function join(args: { account: Address; commitment: bigint; signature: Hex }) {
  const { wallet, reader } = op();
  const signed = await reader.verifyMessage({
    address: args.account,
    message: joinMessage(args.commitment, ARL_CHAIN_ID),
    signature: args.signature,
  });
  if (!signed) throw new OperatorRequestError("the signature does not match the account", 401);
  const holds = await reader.readContract({
    address: TOKEN.address,
    abi: erc20,
    functionName: "balanceOf",
    args: [args.account],
  });
  if (holds === 0n)
    throw new OperatorRequestError("hold testnet ARL to join (use the faucet first)", 403);
  const group = await demoGroup();
  if (group.members.includes(args.commitment)) return { member: true, transaction: undefined };
  const next = createGroup([...group.members, args.commitment]);
  const hash = group.exists
    ? await wallet.writeContract({
        address: SIGNAL.address,
        abi: SIGNAL.abi,
        functionName: "addMembers",
        args: [DEMO_GROUP, [args.commitment], next.root],
      })
    : await wallet.writeContract({
        address: SIGNAL.address,
        abi: SIGNAL.abi,
        functionName: "createGroupWithMembers",
        args: [[args.commitment], next.root],
      });
  await reader.waitForTransactionReceipt({ hash });
  return { member: true, transaction: hash };
}

export async function relay(vote: RelayRequest) {
  const { account, wallet, reader } = op();
  const call = {
    address: SIGNAL.address,
    abi: SIGNAL.abi,
    functionName: "signal",
    args: [DEMO_GROUP, vote.scope, vote.message, vote.root, vote.nullifier, vote.proof],
    account,
  } as const;
  // The contract checks the proof, the root and the nullifier; nothing is sent if it would revert.
  try {
    await reader.simulateContract(call);
  } catch (e) {
    throw new OperatorRequestError(
      `the vote is not valid: ${e instanceof Error ? (e.message.split("\n")[0] ?? "") : ""}`,
    );
  }
  const hash = await wallet.writeContract(call);
  await reader.waitForTransactionReceipt({ hash });
  return { transaction: hash };
}

let facilitator: ArlUptoFacilitator | undefined;

export async function settle(request: SettleRequest): Promise<SettleResponse> {
  const { account, wallet } = op();
  type SignerInput = Parameters<typeof toFacilitatorEvmSigner>[0];
  facilitator ??= new ArlUptoFacilitator({
    chainId: ARL_CHAIN_ID,
    arlToken: TOKEN.address,
    scheme: new UptoFacilitator(
      toFacilitatorEvmSigner({ ...wallet, address: account.address } as unknown as SignerInput),
    ),
    store: new InMemoryAuthorizationStore(),
  });
  const payload = request.payload as unknown as PaymentPayload;
  const signedTerms = request.requirements as unknown as PaymentRequirements;
  // The signature covers the ceiling; the settlement carries the metered amount.
  const verified = await facilitator.verify(payload, signedTerms);
  if (!verified.isValid)
    throw new OperatorRequestError(`authorization refused: ${verified.invalidReason ?? "invalid"}`);
  return facilitator.settle(payload, { ...signedTerms, amount: request.amount.toString() });
}

export function operatorAddress(): Address {
  return op().account.address;
}
