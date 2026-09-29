"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import deployedContracts from "~~/contracts/deployedContracts";
import type { ListedService } from "~~/hooks/arl/useArlServices";
import { statusName } from "~~/lib/jobs";
import {
  REPUTATION_REGISTRY,
  reputationRegistryAbi,
  summarise,
  verifiedRatings,
} from "~~/lib/reputation";
import type { FeedbackEvent, JobView, Rating } from "~~/lib/reputation";

const JOBS = deployedContracts[31337].ARLJobs;

export interface ServiceRatings {
  ratings: Rating[];
  count: number;
  average?: number;
}

/**
 * Verified job ratings per service (agent id): ERC-8004 feedback that points to a paid ARLJobs
 * job of that service, written by the job's client (see lib/reputation.ts).
 */
export function useJobRatings(services: readonly ListedService[] | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: [
      "arl-job-ratings",
      client?.chain.id,
      services?.map((s) => `${s.agentId.toString()}:${s.terms.payTo}`).join(","),
    ],
    enabled: !!client && !!services,
    refetchInterval: 4_000,
    queryFn: async (): Promise<Map<bigint, ServiceRatings>> => {
      const out = new Map<bigint, ServiceRatings>();
      if (!client || !services?.length) return out;
      const [given, revokedLogs, funded] = await Promise.all([
        client.getContractEvents({
          address: REPUTATION_REGISTRY,
          abi: reputationRegistryAbi,
          eventName: "NewFeedback",
          fromBlock: 0n,
        }),
        client.getContractEvents({
          address: REPUTATION_REGISTRY,
          abi: reputationRegistryAbi,
          eventName: "FeedbackRevoked",
          fromBlock: 0n,
        }),
        client.getContractEvents({
          address: JOBS.address,
          abi: JOBS.abi,
          eventName: "JobFunded",
          fromBlock: 0n,
        }),
      ]);
      const events: FeedbackEvent[] = given.flatMap((l) => {
        const a = l.args;
        if (
          a.agentId === undefined ||
          !a.clientAddress ||
          a.feedbackIndex === undefined ||
          a.value === undefined ||
          a.valueDecimals === undefined
        )
          return [];
        return [
          {
            agentId: a.agentId,
            client: a.clientAddress,
            index: a.feedbackIndex,
            value: a.value,
            valueDecimals: a.valueDecimals,
            tag1: a.tag1 ?? "",
            tag2: a.tag2 ?? "",
            uri: a.feedbackURI ?? "",
            hash: a.feedbackHash ?? "0x",
          },
        ];
      });
      const revoked = new Set(
        revokedLogs.flatMap((l) =>
          l.args.clientAddress && l.args.feedbackIndex !== undefined
            ? [`${l.args.clientAddress}:${l.args.feedbackIndex.toString()}`]
            : [],
        ),
      );
      const fundedIds = new Set(
        funded.flatMap((l) => (l.args.jobId === undefined ? [] : [l.args.jobId])),
      );
      // Only the jobs that some rating could refer to need reading.
      const jobs = new Map<bigint, JobView>();
      await Promise.all(
        [...fundedIds].map(async (id) => {
          const j = await client.readContract({
            address: JOBS.address,
            abi: JOBS.abi,
            functionName: "getJob",
            args: [id],
          });
          jobs.set(id, {
            client: j.client,
            provider: j.provider,
            status: statusName(j.status),
            funded: true,
          });
        }),
      );
      for (const s of services) {
        const ratings = verifiedRatings({
          chainId: client.chain.id,
          agentId: s.agentId,
          payTo: s.terms.payTo,
          jobsAddress: JOBS.address,
          events,
          revoked,
          jobs,
        });
        out.set(s.agentId, { ratings, ...summarise(ratings) });
      }
      return out;
    },
  });
}
