// End-to-end: the reference compute provider over HTTP, paid by the real x402 SDK client, and
// settled through ARL's facilitator service (HTTP, bearer token, records on disk) running the real
// SDK facilitator, on a local Anvil fork of Base Sepolia with the real Permit2 and
// x402UptoPermit2Proxy.
//
// Nothing leaves the machine: Anvil forks read state from the RPC and every transaction stays
// local. Accounts are Anvil's publicly known development accounts, which only have funds on the
// fork. ARL is deployed on the fork from the Foundry build (contracts/out).
//
// Run: ARL_FORK_RPC=<Base Sepolia RPC> npm run test:fork -w @arl/provider
// (requires `forge build` in contracts/ and `anvil` on PATH).

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  ArlUptoFacilitator,
  BASE_SEPOLIA,
  FileAuthorizationStore,
  assertPinnedCode,
  createFacilitatorServer,
} from "@arl/payments";
import {
  HTTPFacilitatorClient,
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
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

import { ComputeProvider, createProviderServer } from "../src/index.ts";

const RPC = process.env.ARL_FORK_RPC;
const FORK_BLOCK = "47419967";
const PORT = 8598;
const LOCAL = `http://127.0.0.1:${String(PORT)}`;
// Anvil's default development mnemonic (public; test funds on local chains only).
const DEV_MNEMONIC = "test test test test test test test test test test test junk";

const deployer = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 0 });
const payer = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 1 });
const facilitatorAccount = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 2 });
const payTo = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 3 }).address;

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

/** ARL's facilitator as a service; returns the SDK client a resource server uses to reach it. */
async function startFacilitator(token: string) {
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
  const server = createFacilitatorServer({
    chainId: 84_532,
    signer: facilitatorAccount.address,
    bearerToken: token,
    facilitator: new ArlUptoFacilitator({
      chainId: 84_532,
      arlToken: arl,
      scheme: new UptoFacilitator(signer),
      store: new FileAuthorizationStore(
        join(mkdtempSync(join(tmpdir(), "arl-facilitator-")), "authorizations.jsonl"),
      ),
    }),
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const auth = { Authorization: `Bearer ${token}` };
  const client = new HTTPFacilitatorClient({
    url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    createAuthHeaders: () => Promise.resolve({ verify: auth, settle: auth, supported: {} }),
  });
  return { client, close: () => server.close() };
}

const balance = async (who: Hex) =>
  publicClient.readContract({
    address: arl,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });

const PRICE = 10n ** 16n; // 0.01 ARL per second
const node = (script: string) => ({ command: process.execPath, args: ["-e", script] });

describe(
  "compute provider paid in ARL on a Base Sepolia fork",
  { skip: RPC ? false : "ARL_FORK_RPC not set" },
  () => {
    let base = "";
    let close = () => undefined as unknown;

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

    before(async () => {
      const f = await startFacilitator("fork-test-token");
      const server = createProviderServer(
        new ComputeProvider({
          chainId: 84_532,
          arlToken: arl,
          payTo: payTo,
          facilitatorAddress: facilitatorAccount.address,
          pricePerSecond: PRICE,
          maxSeconds: 60,
          jobs: {
            // Echoes its input after about 1.2 s: billed as 2 seconds.
            echo: node("setTimeout(() => process.stdin.pipe(process.stdout), 1200)"),
            forever: node("setInterval(() => {}, 1000)"),
          },
          facilitator: f.client,
        }),
      ).listen(0, "127.0.0.1");
      close = () => {
        server.close();
        f.close();
      };
      return new Promise<void>((resolve) => {
        server.once("listening", () => {
          base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
          resolve();
        });
      });
    });

    after(() => {
      close();
      anvil?.kill();
    });

    /** The consumer's side: ask, sign what the provider requires, send it with the input. */
    async function hire(job: string, seconds: number, input: string) {
      const url = `${base}/jobs/${job}?seconds=${String(seconds)}`;
      const unpaid = await fetch(url, { method: "POST", body: input });
      assert.equal(unpaid.status, 402);
      const [requirements] = decodePaymentRequiredHeader(
        unpaid.headers.get("PAYMENT-REQUIRED") ?? "",
      ).accepts;
      assert.ok(requirements);
      const client = new UptoClient(toClientEvmSigner(payer, publicClient));
      const signed = await client.createPaymentPayload(2, requirements);
      const payment: PaymentPayload = {
        x402Version: 2,
        accepted: requirements,
        payload: signed.payload,
      };
      const res = await fetch(url, {
        method: "POST",
        body: input,
        headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payment) },
      });
      const body = (await res.json()) as {
        stdout: string;
        amount: string;
        billedSeconds: string;
        capped: boolean;
        timedOut: boolean;
      };
      return {
        status: res.status,
        body,
        receipt: decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE") ?? ""),
        payment,
        url,
        input,
      };
    }

    it("runs a job and is paid on-chain for the seconds used, below the ceiling", async () => {
      const payerBefore = await balance(payer.address);
      const payToBefore = await balance(payTo);
      const r = await hire("echo", 30, "hello");
      assert.equal(r.status, 200);
      assert.equal(Buffer.from(r.body.stdout, "base64").toString(), "hello");
      assert.equal(r.body.billedSeconds, "2");
      assert.equal(r.body.amount, (PRICE * 2n).toString());
      assert.equal(r.receipt.success, true);
      assert.match(r.receipt.transaction, /^0x[0-9a-f]{64}$/);
      assert.equal((await balance(payTo)) - payToBefore, PRICE * 2n);
      assert.equal(payerBefore - (await balance(payer.address)), PRICE * 2n);
    });

    it("kills a job at the paid time and settles exactly the ceiling", async () => {
      const before = await balance(payTo);
      const r = await hire("forever", 2, "");
      assert.equal(r.status, 200);
      assert.equal(r.body.timedOut, true);
      assert.equal(r.body.amount, (PRICE * 2n).toString());
      assert.equal((await balance(payTo)) - before, PRICE * 2n);
    });

    it("does not run or charge a second time for the same payment", async () => {
      const r = await hire("echo", 5, "once");
      const before = await balance(payTo);
      const again = await fetch(r.url, {
        method: "POST",
        body: r.input,
        headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(r.payment) },
      });
      // Refused before it runs: by the SDK's verification (the Permit2 nonce is used on-chain,
      // 402) or, while the first run is still settling, by the provider's own record (409).
      assert.ok([402, 409].includes(again.status), String(again.status));
      assert.match(
        ((await again.json()) as { error: string }).error,
        /payment refused|already used/,
      );
      assert.equal(await balance(payTo), before);
    });
  },
);
