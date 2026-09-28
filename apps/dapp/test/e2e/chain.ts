// Playwright global setup: a fresh Anvil chain on port 18650 with the app fixture deployed.
// Returns the teardown. Nothing leaves the machine.
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_RPC = "http://127.0.0.1:18650";
const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function chainId(): Promise<string | undefined> {
  try {
    const res = await fetch(E2E_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return ((await res.json()) as { result?: string }).result;
  } catch {
    return undefined;
  }
}

export default async function setup(): Promise<() => void> {
  if (await chainId()) throw new Error(`${E2E_RPC} already serves a chain; stop it first`);
  const anvil = spawn(
    "anvil",
    ["--port", "18650", "--chain-id", "31337", "--block-time", "1", "--silent"],
    {
      stdio: "ignore",
    },
  );
  const failed = new Promise<never>((_, reject) => {
    anvil.once("error", (e) =>
      reject(new Error(`cannot start anvil (is Foundry on PATH?): ${e.message}`)),
    );
  });
  const ready = (async () => {
    for (let i = 0; i < 100 && !(await chainId()); i++)
      await new Promise((r) => setTimeout(r, 100));
  })();
  await Promise.race([ready, failed]);
  if ((await chainId()) !== "0x7a69") throw new Error("anvil did not start");

  // Deploys the fixture and checks that the committed contract addresses match it.
  execFileSync("bash", [join(app, "scripts", "deploy-fixture.sh"), "--check"], {
    env: { ...process.env, ARL_RPC_URL: E2E_RPC },
    stdio: "inherit",
  });
  return () => {
    anvil.kill();
  };
}
