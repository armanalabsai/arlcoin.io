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

/**
 * Every job for the explorer, read from contract state: `jobCounter` and one `getJob` per job, no
 * event history. The history is read only when a job's status alone does not say whether it was
 * ever funded (Rejected or Expired), so the usual page load is a handful of calls however old the
 * escrow is. Newest first; deliverables are not included (the Jobs page reads them).
 */
export async function loadJobsFromState(client: PublicClient): Promise<Job[]> {
  const count = await client.readContract({
    address: JOBS.address,
    abi: JOBS.abi,
    functionName: "jobCounter",
  });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const read = await Promise.all(
    ids.map(async (id) => {
      const j = await client.readContract({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "getJob",
        args: [id],
      });
      return { id, j, status: statusName(j.status) };
    }),
  );
  const unclear = read.some((r) => r.status === "Rejected" || r.status === "Expired");
  const funded = unclear
    ? new Set(
        (
          await eventsSince(client, deployBlock(JOBS), (range) =>
            client.getContractEvents({
              address: JOBS.address,
              abi: JOBS.abi,
              eventName: "JobFunded",
              ...range,
            }),
          )
        ).flatMap((l) => (l.args.jobId === undefined ? [] : [l.args.jobId])),
      )
    : new Set<bigint>();
  return read
    .map(
      ({ id, j, status }) =>
        ({
          id,
          client: j.client,
          provider: j.provider,
          evaluator: j.evaluator,
          description: j.description,
          budget: j.budget,
          expiredAt: j.expiredAt,
          status,
          funded:
            status === "Funded" ||
            status === "Submitted" ||
            status === "Completed" ||
            funded.has(id),
        }) satisfies Job,
    )
    .reverse();
}

/** All jobs on ARLJobs for the explorer, refreshed while the page is open. */
export function useAllJobs() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["arl-all-jobs", client?.chain.id],
    enabled: !!client,
    refetchInterval: REFRESH_MS,
    queryFn: () => (client ? loadJobsFromState(client) : Promise.resolve([])),
  });
}
