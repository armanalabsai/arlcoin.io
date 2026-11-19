// The built-in arl-policy/1 documents (spec/arl-policy/v0.1.0/policies). Kept here as data so the
// SDK, the read API and the MCP server carry them without reading files; a test checks that they
// equal the spec's JSON files.

import { POLICY_VERSION, parsePolicy, type Policy } from "./policy.ts";

const ARL_100 = "100000000000000000000";

const RAW: unknown[] = [
  {
    version: POLICY_VERSION,
    id: "reexec-standard",
    workload_classes: ["reexec"],
    tiers: ["reexecution"],
    committee: { min_size: 3, max_size: 7 },
    vote_window_seconds: [3600, 86400],
    challenge_window_seconds: [86400, 259200],
    min_bond_floor: ARL_100,
    bond_covers_budget: true,
    required_evidence: ["result-manifest"],
    model: { allowed: false, max_budget: {}, models: [] },
  },
  {
    version: POLICY_VERSION,
    id: "fallback-review",
    workload_classes: ["review"],
    tiers: ["fallback"],
    committee: { min_size: 1, max_size: 1 },
    vote_window_seconds: [600, 86400],
    challenge_window_seconds: [86400, 172800],
    min_bond_floor: ARL_100,
    bond_covers_budget: true,
    required_evidence: ["artifact"],
    model: { allowed: false, max_budget: {}, models: [] },
  },
  {
    version: POLICY_VERSION,
    id: "model-assisted-review",
    workload_classes: ["model-assisted"],
    tiers: ["attested"],
    committee: { min_size: 3, max_size: 7 },
    vote_window_seconds: [3600, 172800],
    challenge_window_seconds: [86400, 259200],
    min_bond_floor: ARL_100,
    bond_covers_budget: true,
    required_evidence: ["artifact", "model-verdict"],
    model: { allowed: true, max_budget: { ARL: ARL_100, USDC: "100000000" }, models: [] },
  },
  // Job-type policies: one per common kind of agent work, each paired with a task template in
  // spec/arl-policy/v0.1.0/templates and a validator checklist in the spec README.
  {
    version: POLICY_VERSION,
    id: "code-tests",
    workload_classes: ["reexec"],
    tiers: ["reexecution"],
    committee: { min_size: 3, max_size: 7 },
    vote_window_seconds: [3600, 86400],
    challenge_window_seconds: [86400, 259200],
    min_bond_floor: ARL_100,
    bond_covers_budget: true,
    required_evidence: ["result-manifest", "logs"],
    model: { allowed: false, max_budget: {}, models: [] },
  },
  {
    version: POLICY_VERSION,
    id: "data-recompute",
    workload_classes: ["reexec"],
    tiers: ["reexecution"],
    committee: { min_size: 3, max_size: 7 },
    vote_window_seconds: [3600, 86400],
    challenge_window_seconds: [86400, 259200],
    min_bond_floor: ARL_100,
    bond_covers_budget: true,
    required_evidence: ["result-manifest", "artifact"],
    model: { allowed: false, max_budget: {}, models: [] },
  },
  {
    version: POLICY_VERSION,
    id: "gpu-inference",
    workload_classes: ["attested"],
    tiers: ["attested"],
    committee: { min_size: 3, max_size: 7 },
    vote_window_seconds: [3600, 172800],
    challenge_window_seconds: [86400, 259200],
    min_bond_floor: ARL_100,
    bond_covers_budget: true,
    required_evidence: ["attestation", "result-manifest", "logs"],
    model: { allowed: false, max_budget: {}, models: [] },
  },
  {
    version: POLICY_VERSION,
    id: "research-sources",
    workload_classes: ["model-assisted"],
    tiers: ["attested"],
    committee: { min_size: 3, max_size: 7 },
    vote_window_seconds: [3600, 172800],
    challenge_window_seconds: [86400, 259200],
    min_bond_floor: ARL_100,
    bond_covers_budget: true,
    required_evidence: ["artifact", "model-verdict", "logs"],
    model: { allowed: true, max_budget: { ARL: ARL_100, USDC: "100000000" }, models: [] },
  },
];

/** The built-in policies, validated, by id. */
export const BUILTIN_POLICIES: ReadonlyMap<string, Policy> = new Map(
  RAW.map((r) => {
    const p = parsePolicy(r);
    return [p.id, p];
  }),
);

/** The built-in policy a task names (`arl-policy/1:<id>`), or undefined. */
export function builtinPolicy(ref: string): Policy | undefined {
  const prefix = `${POLICY_VERSION}:`;
  return ref.startsWith(prefix) ? BUILTIN_POLICIES.get(ref.slice(prefix.length)) : undefined;
}
