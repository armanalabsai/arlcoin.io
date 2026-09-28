// Circulating supply (economic specification section 5), computed from on-chain balances only:
//
//   Circulating Supply = totalSupply - balances held by protocol-controlled or locked addresses
//
// The arithmetic is exact (bigint base units). On-chain reads use viem (MIT).

import { createPublicClient, erc20Abi, formatUnits, http, type Address } from "viem";

import { MANIFEST_SCHEMA, type DeploymentManifest } from "./manifest.ts";

export interface SupplyReport {
  chainId: number;
  token: string;
  totalSupply: bigint;
  lockedSupply: bigint;
  circulatingSupply: bigint;
  holders: { role: string; address: string; circulating: boolean; balance: bigint }[];
}

export class SupplyError extends Error {
  override name = "SupplyError";
}

/** Pure calculation from a total supply and the balance of every manifest holder. */
export function computeSupply(
  manifest: DeploymentManifest,
  totalSupply: bigint,
  balanceOf: (address: string) => bigint,
): SupplyReport {
  // The manifest is read from JSON, so its schema field is untrusted input.
  const schema: unknown = manifest.schema;
  if (schema !== MANIFEST_SCHEMA) {
    throw new SupplyError(`manifest schema ${JSON.stringify(schema)} is not ${MANIFEST_SCHEMA}`);
  }
  if (totalSupply !== BigInt(manifest.maxSupply)) {
    throw new SupplyError(
      `totalSupply ${totalSupply} differs from max supply ${manifest.maxSupply}`,
    );
  }
  let locked = 0n;
  const holders = manifest.holders.map((h) => {
    const balance = balanceOf(h.address);
    if (balance < 0n) throw new SupplyError(`${h.role}: negative balance`);
    if (!h.circulating) locked += balance;
    return { role: h.role, address: h.address, circulating: h.circulating, balance };
  });
  if (locked > totalSupply) throw new SupplyError("locked supply exceeds total supply");
  return {
    chainId: manifest.chainId,
    token: manifest.token,
    totalSupply,
    lockedSupply: locked,
    circulatingSupply: totalSupply - locked,
    holders,
  };
}

/** Reads `totalSupply` and every holder balance from the chain, then computes the report. */
export async function readSupply(
  manifest: DeploymentManifest,
  rpcUrl: string,
): Promise<SupplyReport> {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  if (chainId !== manifest.chainId) {
    throw new SupplyError(
      `RPC chain ${String(chainId)} is not manifest chain ${String(manifest.chainId)}`,
    );
  }
  const token = manifest.token as Address;
  const blockNumber = await client.getBlockNumber();
  // Every read uses the same block, so the report is one consistent snapshot.
  const totalSupply = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "totalSupply",
    blockNumber,
  });
  const balances = new Map<string, bigint>();
  for (const h of manifest.holders) {
    balances.set(
      h.address.toLowerCase(),
      await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [h.address as Address],
        blockNumber,
      }),
    );
  }
  return computeSupply(manifest, totalSupply, (a) => balances.get(a.toLowerCase()) ?? 0n);
}

/** JSON-safe form: base-unit integer strings plus exact ARL decimal strings (18 decimals). */
export function formatReport(report: SupplyReport) {
  const arl = (v: bigint) => formatUnits(v, 18);
  return {
    chainId: report.chainId,
    token: report.token,
    totalSupply: report.totalSupply.toString(),
    lockedSupply: report.lockedSupply.toString(),
    circulatingSupply: report.circulatingSupply.toString(),
    totalSupplyArl: arl(report.totalSupply),
    lockedSupplyArl: arl(report.lockedSupply),
    circulatingSupplyArl: arl(report.circulatingSupply),
    holders: report.holders.map((h) => ({ ...h, balance: h.balance.toString() })),
  };
}
