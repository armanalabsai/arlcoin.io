// The compiled circuit (nargo 1.0.0-rc.3, zk/semaphore), read from the package.
import { readFileSync } from "node:fs";

import type { CompiledCircuit } from "@noir-lang/noir_js";

export function loadCircuit(): CompiledCircuit {
  return JSON.parse(
    readFileSync(new URL("../circuit/arl_semaphore.json", import.meta.url), "utf8"),
  ) as CompiledCircuit;
}
