"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { IDENTITY_REGISTRY, identityRegistryAbi, parseRegistration } from "~~/lib/registry";
import type { ArlService } from "~~/lib/registry";

export interface ListedService extends ArlService {
  agentId: bigint;
  owner: Address;
}

/**
 * ARL services on the ERC-8004 IdentityRegistry: every agent whose current registration file
 * carries valid ARL terms for this chain and for ARL itself. Other agents are ignored.
 */
export function useArlServices() {
  const client = usePublicClient();
  const { data: token } = useDeployedContractInfo({ contractName: "ARLToken" });
  return useQuery({
    queryKey: ["arl-services", client?.chain.id, token?.address],
    enabled: !!client && !!token,
    refetchInterval: 4_000,
    queryFn: async (): Promise<ListedService[]> => {
      if (!client || !token) return [];
      const [registered, updated] = await Promise.all([
        client.getContractEvents({
          address: IDENTITY_REGISTRY,
          abi: identityRegistryAbi,
          eventName: "Registered",
          fromBlock: 0n,
        }),
        client.getContractEvents({
          address: IDENTITY_REGISTRY,
          abi: identityRegistryAbi,
          eventName: "URIUpdated",
          fromBlock: 0n,
        }),
      ]);
      // The latest URI per agent, in log order.
      const uris = new Map<bigint, string>();
      for (const log of [...registered, ...updated].sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? (a.logIndex ?? 0) - (b.logIndex ?? 0)
          : Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)),
      )) {
        const id = log.args.agentId;
        const uri = log.eventName === "Registered" ? log.args.agentURI : log.args.newURI;
        if (id !== undefined && uri !== undefined) uris.set(id, uri);
      }
      const network = `eip155:${String(client.chain.id)}`;
      const services: ListedService[] = [];
      for (const [agentId, uri] of uris) {
        const parsed = parseRegistration(uri);
        if (!parsed.ok) continue;
        const s = parsed.value;
        if (s.terms.network !== network || s.terms.asset !== getAddress(token.address)) continue;
        const owner = await client.readContract({
          address: IDENTITY_REGISTRY,
          abi: identityRegistryAbi,
          functionName: "ownerOf",
          args: [agentId],
        });
        services.push({ ...s, agentId, owner });
      }
      return services;
    },
  });
}
