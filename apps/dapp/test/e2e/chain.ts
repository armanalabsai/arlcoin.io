// Playwright global setup: a fresh Anvil chain on port 18650 with the app fixture deployed.
// Returns the teardown. Nothing leaves the machine.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
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

/** The proving parameters (CRS) bb.js downloads in the browser, cached for the tests so that the
 *  browser does not depend on the network: 2^19 compressed BN254 G1 points (what the browser
 *  build asks for), the G2 points and 2^17 Grumpkin points. The files are re-fetched when a
 *  cached one is shorter than needed. */
export const CRS_DIR = join(app, "test-results", "crs");
function cacheCrs() {
  mkdirSync(CRS_DIR, { recursive: true });
  const get = (file: string, range?: string) => {
    const out = join(CRS_DIR, file);
    if (existsSync(out) && (!range || statSync(out).size === Number(range.split("-")[1]) + 1))
      return;
    execFileSync("curl", [
      "-sSfL",
      ...(range ? ["-r", range] : []),
      "-o",
      out,
      `https://crs.aztec-cdn.foundation/${file}`,
    ]);
  };
  get("g1_compressed.dat", `0-${String(2 ** 19 * 32 - 1)}`);
  get("g2.dat");
  get("grumpkin_g1_v2.dat", `0-${String(2 ** 17 * 64 - 1)}`);
}

export default async function setup(): Promise<() => void> {
  cacheCrs();
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
