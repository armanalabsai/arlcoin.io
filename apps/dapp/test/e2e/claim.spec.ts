// The Public Launch claim on the local Anvil chain: a real ARLMerkleDistributor is deployed and
// funded here, its list is served to the page as `claims/31337.json`, and the "Local dev account"
// claims through the browser. A list that does not match the distributor is refused.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { encodeDeployData, encodeFunctionData, erc20Abi, type Abi, type Hex } from "viem";

import deployedContracts from "../../contracts/deployedContracts";
import { E2E_RPC } from "./chain";

const OPERATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OTHER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const ARL = deployedContracts[31337].ARLToken.address;
const UNIT = 10n ** 18n;

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(E2E_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

/** Sends from an account Anvil unlocks and waits for a successful receipt. */
async function send(from: string, tx: { to?: string; data: Hex }) {
  const hash = await rpc<Hex>("eth_sendTransaction", [{ from, ...tx }]);
  for (let i = 0; i < 100; i++) {
    const r = await rpc<{ status: Hex; contractAddress: string | null } | null>(
      "eth_getTransactionReceipt",
      [hash],
    );
    if (r) {
      if (r.status !== "0x1") throw new Error(`transaction ${hash} reverted`);
      return r;
    }
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error(`transaction ${hash} not mined`);
}

async function arlBalance(account: string): Promise<bigint> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account as Hex],
  });
  return BigInt(await rpc<Hex>("eth_call", [{ to: ARL, data }, "latest"]));
}

async function connect(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await page.getByRole("button", { name: /Local dev account/ }).click();
  await expect(page.getByTestId("account")).toContainText("0x7099");
}

function claimList(distributor: string, values: [string, string, string][]) {
  const tree = StandardMerkleTree.of(values, ["uint256", "address", "uint256"]);
  const claims: Record<string, { index: number; amount: string; proof: string[] }> = {};
  for (const [i, [index, account, amount]] of tree.entries()) {
    claims[account] = { index: Number(index), amount, proof: tree.getProof(i) };
  }
  return {
    schema: "arl-claim-list/1",
    chainId: 31337,
    distributor,
    token: ARL,
    distribution: {
      schema: "arl-distribution/1",
      allocation: "publicLaunch",
      merkleRoot: tree.root,
      leafEncoding: ["uint256", "address", "uint256"],
      total: values.reduce((s, [, , a]) => s + BigInt(a), 0n).toString(),
      count: values.length,
      claims,
    },
  };
}

test.describe.configure({ mode: "serial" });

test("claim: nothing to claim before a list is published", async ({ page }) => {
  await connect(page, "/claim");
  await expect(page.getByTestId("claim-none")).toBeVisible();
  await expect(page.getByTestId("claim-submit")).toHaveCount(0);
});

test("claim: a whitelisted address claims once; a list that does not match is refused", async ({
  page,
}) => {
  const values: [string, string, string][] = [
    ["0", USER, (10_000n * UNIT).toString()],
    ["1", OTHER, (500n * UNIT).toString()],
  ];
  const list = claimList("0x0000000000000000000000000000000000000001", values);
  const artifact = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "../../../../contracts/out/ARLMerkleDistributor.sol/ARLMerkleDistributor.json",
      ),
      "utf8",
    ),
  ) as { abi: Abi; bytecode: { object: Hex } };
  const block = await rpc<{ timestamp: Hex }>("eth_getBlockByNumber", ["latest", false]);
  const claimEnd = BigInt(block.timestamp) + 60n * 86_400n;
  const deployed = await send(OPERATOR, {
    data: encodeDeployData({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [ARL, list.distribution.merkleRoot, claimEnd, OPERATOR],
    }),
  });
  const distributor = deployed.contractAddress;
  if (!distributor) throw new Error("no distributor address");
  list.distributor = distributor;
  // Funded by a separate transfer, as the Public Launch Safe does.
  await send(USER, {
    to: ARL,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [distributor as Hex, 10_500n * UNIT],
    }),
  });

  let served: unknown = list;
  await page.route("**/claims/31337.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(served) }),
  );

  // A list whose root is not the distributor's: no claim is offered.
  served = { ...claimList(distributor, [["0", USER, (99_999n * UNIT).toString()]]) };
  await connect(page, "/claim");
  await expect(page.getByTestId("claim-invalid")).toContainText("root");
  await expect(page.getByTestId("claim-submit")).toHaveCount(0);

  // A tampered amount fails its proof before the chain is even asked.
  const tampered = structuredClone(list);
  const mine = tampered.distribution.claims[USER];
  if (!mine) throw new Error("no claim for the user");
  mine.amount = (20_000n * UNIT).toString();
  served = tampered;
  await connect(page, "/claim");
  await expect(page.getByTestId("claim-invalid")).toContainText("proof");

  // The published list: claim, then the claim is spent.
  served = list;
  await connect(page, "/claim");
  await expect(page.getByTestId("claim-amount")).toContainText("10,000");
  await expect(page.getByTestId("claim-status")).toHaveText("Open");
  const before = await arlBalance(USER);
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("claim-status")).toHaveText("Claimed", { timeout: 30_000 });
  expect(await arlBalance(USER)).toBe(before + 10_000n * UNIT);
  await expect(page.getByTestId("claim-submit")).toHaveCount(0);
});
