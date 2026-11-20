"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hex, PublicClient } from "viem";
import { usePublicClient } from "wagmi";

import { statusName } from "~~/lib/jobs";
import type { Job } from "~~/lib/jobs";
import { ARL, REFRESH_MS, deployBlock } from "~~/lib/contracts";
import { eventsSince } from "~~/lib/logs";

const JOBS = ARL.ARLJobs;

/** Every job on ARLJobs, newest first, with whether it was funded and its delivered result. */
export async function loadAllJobs(client: PublicClient): Promise<Job[]> {
  const [created, submitted, fundedLogs] = await Promise.all([
    eventsSince(client, deployBlock(JOBS), (range) =>
      client.getContractEvents({
        address: JOBS.address,
        abi: JOBS.abi,
        eventName: "JobCreated",
        ...range,
      }),
    ),
    eventsSince(client, deployBlock(JOBS), (range) =>
      client.getContractEvents({
        address: JOBS.address,
        abi: JOBS.abi,
        eventName: "JobSubmitted",
        ...range,
      }),
    ),
    eventsSince(client, deployBlock(JOBS), (range) =>
      client.getContractEvents({
        address: JOBS.address,
        abi: JOBS.abi,
        eventName: "JobFunded",
        ...range,
      }),
    ),
  ]);
  const funded = new Set(
    fundedLogs.flatMap((l) => (l.args.jobId === undefined ? [] : [l.args.jobId])),
  );
  const delivered = new Map<bigint, Hex>();
  for (const s of submitted)
    if (s.args.jobId !== undefined && s.args.deliverable)
      delivered.set(s.args.jobId, s.args.deliverable);
  const ids = created.flatMap((c) => (c.args.jobId === undefined ? [] : [c.args.jobId]));
  const jobs = await Promise.all(
    ids.map(async (id) => {
      const j = await client.readContract({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "getJob",
        args: [id],
      });
      return {
        id,
        client: j.client,
        provider: j.provider,
        evaluator: j.evaluator,
        description: j.description,
        budget: j.budget,
        expiredAt: j.expiredAt,
        status: statusName(j.status),
        deliverable: delivered.get(id),
        funded: funded.has(id),
      } satisfies Job;
    }),
  );
  return jobs.reverse();
}

/** All jobs on ARLJobs, refreshed while the page is open. */
export function useAllJobs() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["arl-all-jobs", client?.chain.id],
    enabled: !!client,
    refetchInterval: REFRESH_MS,
    queryFn: () => (client ? loadAllJobs(client) : Promise.resolve([])),
  });
}
