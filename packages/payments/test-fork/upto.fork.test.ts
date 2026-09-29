// End-to-end: the x402 SDK (client and facilitator, npm @x402/evm 2.27.0) through ARL's wrapper,
// on a local Anvil fork of Base Sepolia with the real Permit2 and x402UptoPermit2Proxy.
//
// Nothing leaves the machine: Anvil forks read state from the RPC and every transaction stays
// local. Accounts are Anvil's publicly known development accounts, which only have funds on the
// fork. ARL is deployed on the fork from the Foundry build (contracts/out).
//
// Run: ARL_FORK_RPC=<Base Sepolia RPC> npm run test:fork -w @arl/payments
// (requires `forge build` in contracts/ and `anvil` on PATH).

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import type { PaymentPayload } from "@x402/core/types";
import { UptoEvmScheme as UptoClient, toClientEvmSigner, toFacilitatorEvmSigner } from "@x402/evm";
import { UptoEvmScheme as UptoFacilitator } from "@x402/evm/upto/facilitator";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  maxUint256,
  publicActions,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  ArlUptoFacilitator,
  BASE_SEPOLIA,
  InMemoryAuthorizationStore,
  assertPinnedCode,
  buildUptoRequirements,
  meter,
} from "../src/index.ts";

const RPC = process.env.ARL_FORK_RPC;
const FORK_BLOCK = "47419967";
const PORT = 8599;
const LOCAL = `http://127.0.0.1:${String(PORT)}`;
// Anvil's default development mnemonic (public; test funds on local chains only).
const DEV_MNEMONIC = "test test test test test test test test test test test junk";

const deployer = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 0 });
const payer = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 1 });
const facilitatorAccount = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 2 });
const provider = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 3 }).address;

const chain = { ...baseSepolia, rpcUrls: { default: { http: [LOCAL] } } };
const publicClient = createPublicClient({ chain, transport: http(LOCAL) });

let anvil: ChildProcess | undefined;
let arl: Hex;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(LOCAL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function waitForAnvil(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      await rpc("eth_chainId", []);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("anvil did not start");
}

function facilitatorFor(store = new InMemoryAuthorizationStore()) {
  const wallet = createWalletClient({
    account: facilitatorAccount,
    chain,
    transport: http(LOCAL),
  }).extend(publicActions);
  // viem's client satisfies the SDK signer at runtime; its method overloads are wider than the
  // SDK's structural type, so the parameter type is asserted here (test code only).
  type SignerInput = Parameters<typeof toFacilitatorEvmSigner>[0];
  const signer = toFacilitatorEvmSigner({
    ...wallet,
    address: facilitatorAccount.address,
  } as unknown as SignerInput);
  return new ArlUptoFacilitator({
    chainId: 84_532,
    arlToken: arl,
    scheme: new UptoFacilitator(signer),
    store,
  });
}

async function signPayment(maxAmount: bigint): Promise<PaymentPayload> {
  const requirements = buildUptoRequirements({
    chainId: 84_532,
    arlToken: arl,
    maxAmount,
    payTo: provider,
    facilitator: facilitatorAccount.address,
    maxTimeoutSeconds: 300,
  });
  const client = new UptoClient(toClientEvmSigner(payer, publicClient));
  const result = await client.createPaymentPayload(2, requirements);
  return { x402Version: 2, accepted: requirements, payload: result.payload };
}

const balance = async (who: Hex) =>
  publicClient.readContract({
    address: arl,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });

describe(
  "x402 upto with ARL on a Base Sepolia fork",
  { skip: RPC ? false : "ARL_FORK_RPC not set" },
  () => {
    before(async () => {
      anvil = spawn(
        "anvil",
        [
          "--fork-url",
          RPC ?? "",
          "--fork-block-number",
          FORK_BLOCK,
          "--port",
          String(PORT),
          "--silent",
        ],
        { stdio: "ignore" },
      );
      const spawnError = new Promise<never>((_, reject) => {
        anvil?.once("error", (e) => {
          reject(new Error(`cannot start anvil (is Foundry on PATH?): ${e.message}`));
        });
      });
      await Promise.race([waitForAnvil(), spawnError]);
      // Bring chain time to the wall clock: the SDK derives deadlines from Date.now().
      await rpc("evm_setNextBlockTimestamp", [Math.floor(Date.now() / 1000)]);
      await rpc("evm_mine", []);

      await assertPinnedCode(BASE_SEPOLIA, async (address) => {
        const code = await publicClient.getCode({ address });
        const { keccak256 } = await import("viem");
        return keccak256(code ?? "0x");
      });

      // Deploy ARL on the fork. Every allocation goes to the deployer except Public Launch,
      // which goes to the payer (test distribution only).
      const artifact = JSON.parse(
        readFileSync(
          new URL("../../../contracts/out/ARLToken.sol/ARLToken.json", import.meta.url),
          "utf8",
        ),
      ) as { abi: readonly unknown[]; bytecode: { object: Hex } };
      const wallet = createWalletClient({ account: deployer, chain, transport: http(LOCAL) });
      const d = deployer.address;
      const hash = await wallet.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args: [
          {
            publicLaunch: payer.address,
            communityStaking: d,
            ecosystemGrowth: d,
            strategicPartnerships: d,
            liquidity: d,
            founder: d,
            investors: d,
            treasury: d,
            team: d,
            earlyUsers: d,
            grantsBugBounty: d,
          },
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assert.ok(receipt.contractAddress);
      arl = receipt.contractAddress;

      // One-time Permit2 approval by the payer (the gas-sponsored EIP-2612 path is covered by the
      // Foundry fork tests).
      const payerWallet = createWalletClient({ account: payer, chain, transport: http(LOCAL) });
      const approve = await payerWallet.writeContract({
        address: arl,
        abi: erc20Abi,
        functionName: "approve",
        args: [BASE_SEPOLIA.permit2, maxUint256],
      });
      await publicClient.waitForTransactionReceipt({ hash: approve });
    });

    after(() => {
      anvil?.kill();
    });

    it("verifies, settles the metered amount below the ceiling, and refuses a replay", async () => {
      const ceiling = 10n ** 18n;
      const payload = await signPayment(ceiling);
      const f = facilitatorFor();
      const verified = await f.verify(payload, payload.accepted);
      assert.equal(verified.isValid, true, verified.invalidReason);

      const { amount } = meter({ unitPrice: 10n ** 14n, units: 3_000n, ceiling }); // 0.3 ARL
      const before = await balance(provider);
      const settled = await f.settle(payload, { ...payload.accepted, amount: amount.toString() });
      assert.equal(settled.success, true, settled.errorReason);
      assert.match(settled.transaction, /^0x[0-9a-f]{64}$/);
      assert.equal((await balance(provider)) - before, amount);

      const replay = await f.settle(payload, { ...payload.accepted, amount: amount.toString() });
      assert.equal(replay.success, false);
      assert.match(replay.errorReason ?? "", /already settled/);
    });

    it("the chain itself refuses a replay that bypasses ARL's record", async () => {
      const payload = await signPayment(10n ** 18n);
      const store = new InMemoryAuthorizationStore();
      assert.equal(
        (await facilitatorFor(store).settle(payload, { ...payload.accepted, amount: "1000" }))
          .success,
        true,
      );
      // A second facilitator instance with an empty record (the store must be shared in production).
      const second = await facilitatorFor().settle(payload, {
        ...payload.accepted,
        amount: "1000",
      });
      assert.equal(second.success, false);
    });

    it("refuses to settle above the ceiling", async () => {
      const payload = await signPayment(1000n);
      const before = await balance(provider);
      const r = await facilitatorFor().settle(payload, { ...payload.accepted, amount: "1001" });
      assert.equal(r.success, false);
      assert.equal(await balance(provider), before);
    });

    it("retires a zero settlement without a transaction and never settles it later", async () => {
      const payload = await signPayment(1000n);
      const f = facilitatorFor();
      const zero = await f.settle(payload, { ...payload.accepted, amount: "0" });
      assert.equal(zero.success, true);
      assert.equal(zero.transaction, "");
      const later = await f.settle(payload, { ...payload.accepted, amount: "500" });
      assert.equal(later.success, false);
      assert.match(later.errorReason ?? "", /already retired/);
    });

    it("rejects a payload whose receiver was changed after signing", async () => {
      const payload = await signPayment(1000n);
      const tampered = structuredClone(payload);
      const auth = tampered.payload.permit2Authorization as { witness: { to: string } };
      auth.witness.to = deployer.address;
      const r = await facilitatorFor().verify(tampered, tampered.accepted);
      assert.equal(r.isValid, false);
    });
  },
);
