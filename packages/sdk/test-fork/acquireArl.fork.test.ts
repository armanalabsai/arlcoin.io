// Base Mainnet fork: buys ARL from the official Uniswap v3 pools with ETH through acquireArl.
// Needs Foundry (anvil) on PATH and ARL_FORK_RPC (a Base Mainnet RPC); skipped without it.
//   ARL_FORK_RPC=https://mainnet.base.org node --test test-fork/acquireArl.fork.test.ts
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, describe, it } from "node:test";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ARL_SWAP, acquireArl, quoteArl } from "../src/index.ts";

const FORK = process.env.ARL_FORK_RPC;
const PORT = 8548;
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's first development key, funded on the fork only.
const buyer = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
// Plain chain definition with the Base Mainnet id (a fork answers 8453).
const chain = defineChain({
  id: 8453,
  name: "base-fork",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account: buyer, chain, transport: http(RPC) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });

let anvil: ChildProcess | undefined;

describe(
  "acquireArl on a Base Mainnet fork",
  { skip: FORK ? false : "ARL_FORK_RPC not set" },
  () => {
    before(async () => {
      anvil = spawn("anvil", ["--fork-url", FORK ?? "", "--port", String(PORT), "--silent"], {
        stdio: "ignore",
      });
      for (let i = 0; ; i++) {
        try {
          await publicClient.getBlockNumber();
          break;
        } catch (error) {
          if (i > 100) throw error;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      await testClient.setBalance({ address: buyer.address, value: parseEther("10") });
    });

    after(() => {
      anvil?.kill();
    });

    it("quotes and buys exactly the ARL asked for with ETH, within the cap", async () => {
      const amountOut = parseUnits("100", 18);
      const quoted = await quoteArl(publicClient, "ETH", amountOut);
      assert.ok(quoted > 0n);
      const beforeArl = await publicClient.readContract({
        address: ARL_SWAP.arl,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [buyer.address],
      });
      const { amountIn } = await acquireArl(
        { publicClient, walletClient },
        { amountOut, tokenIn: "ETH", maxAmountIn: (quoted * 101n) / 100n },
      );
      const afterArl = await publicClient.readContract({
        address: ARL_SWAP.arl,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [buyer.address],
      });
      assert.equal(afterArl - beforeArl, amountOut);
      assert.ok(amountIn <= (quoted * 101n) / 100n);
    });

    it("refuses when the quote is above maxAmountIn", async () => {
      await assert.rejects(
        acquireArl(
          { publicClient, walletClient },
          { amountOut: parseUnits("100", 18), tokenIn: "ETH", maxAmountIn: 1n },
        ),
        /above maxAmountIn/,
      );
    });
  },
);
