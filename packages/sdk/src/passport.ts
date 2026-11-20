// The agent passport: one answer that says who an ERC-8004 agent is and what it has verifiably
// done. Identity comes from the IdentityRegistry (owner and registration file), the record from
// the verified evaluators (arl-reputation/1). Another platform can use it as its sign-in and
// trust check for an agent.
//
// The registration file is written by the agent's owner: everything taken from it is untrusted
// text, cut to a short length and stripped of control characters, and nothing in it changes the
// score.

import { getAddress, parseAbi, type Address, type PublicClient } from "viem";

import type { Outcome, Score } from "../../protocol/src/index.ts";
import { getAgentScore, type HistoryOptions } from "./agentScore.ts";

/** Canonical ERC-8004 IdentityRegistry on Base Mainnet. */
export const IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

const identityAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

const DATA_URI = "data:application/json;base64,";
const LIMITS = { name: 80, description: 500, uri: 512, file: 16_384 } as const;

/** Untrusted text from a registration file: trimmed, bounded, no control characters. */
function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\p{Cc}/gu, " ").trim();
  return s === "" ? undefined : s.slice(0, max);
}

export interface AgentPassport {
  agentId: bigint;
  /** The block everything was read at. */
  block: bigint;
  /** False when the IdentityRegistry has no such agent; the record below is then empty. */
  registered: boolean;
  owner?: Address;
  /** As stated by the owner in the registration file. Untrusted. */
  name?: string;
  description?: string;
  /** Where the registration file is, when it is not stored on chain. */
  registrationUri?: string;
  score: Score;
  outcomes: Outcome[];
  /** Unix seconds of the first and the latest verified outcome. */
  firstOutcomeAt?: number;
  latestOutcomeAt?: number;
}

function registration(
  uri: string,
): Pick<AgentPassport, "name" | "description" | "registrationUri"> {
  if (!uri.startsWith(DATA_URI)) {
    const where = clean(uri, LIMITS.uri);
    return where === undefined ? {} : { registrationUri: where };
  }
  try {
    const encoded = uri.slice(DATA_URI.length, DATA_URI.length + LIMITS.file * 2);
    const file = JSON.parse(new TextDecoder().decode(base64(encoded))) as Record<string, unknown>;
    const name = clean(file.name, LIMITS.name);
    const description = clean(file.description, LIMITS.description);
    return { ...(name ? { name } : {}), ...(description ? { description } : {}) };
  } catch {
    return {};
  }
}

function base64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Reads an agent's identity and its verified record at one block. */
export async function getAgentPassport(
  client: PublicClient,
  agentId: bigint,
  opts: HistoryOptions = {},
): Promise<AgentPassport> {
  const scored = await getAgentScore(client, agentId, opts);
  const at = { blockNumber: scored.block };
  let owner: Address | undefined;
  let uri = "";
  try {
    owner = getAddress(
      await client.readContract({
        address: IDENTITY_REGISTRY,
        abi: identityAbi,
        functionName: "ownerOf",
        args: [agentId],
        ...at,
      }),
    );
    uri = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: identityAbi,
      functionName: "tokenURI",
      args: [agentId],
      ...at,
    });
  } catch (e) {
    // ownerOf reverts for an agent that does not exist; any other failure is the caller's to see.
    if (!/revert|nonexistent|ERC721/i.test(e instanceof Error ? e.message : String(e))) throw e;
  }
  const times = scored.outcomes.map((o) => o.final_at);
  return {
    agentId,
    block: scored.block,
    registered: owner !== undefined,
    ...(owner ? { owner, ...registration(uri) } : {}),
    score: scored.score,
    outcomes: scored.outcomes,
    ...(times.length > 0
      ? { firstOutcomeAt: Math.min(...times), latestOutcomeAt: Math.max(...times) }
      : {}),
  };
}
