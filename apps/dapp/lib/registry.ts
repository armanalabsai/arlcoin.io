// ARL Network: services and providers on the ERC-8004 IdentityRegistry.
//
// A provider registers its service as an ERC-8004 agent. The agent's registration file (its
// ERC-721 tokenURI) follows ERC-8004 registration-v1 and adds an `arl` section with the price in
// ARL and the x402 `upto` terms: who is paid (payTo) and who settles (facilitator). The file is
// stored on-chain as a base64 JSON data URI, so the app needs no IPFS or HTTP fetch to list
// services. Everything read from the registry is untrusted input and is validated here.

import { getAddress, isAddress } from "viem";
import type { Address } from "viem";

/** Canonical ERC-8004 IdentityRegistry on the testnets it is deployed to (Base Sepolia among
 *  them); the local chain setup installs the same code at the same address. */
export const IDENTITY_REGISTRY: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

export const REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
const DATA_URI_PREFIX = "data:application/json;base64,";

export const LIMITS = { name: 80, description: 500, unit: 40, endpoint: 200, uri: 8192 } as const;

export interface ArlTerms {
  version: 1;
  scheme: "upto";
  network: string;
  asset: Address;
  /** Price of one unit in ARL base units. */
  unitPrice: bigint;
  /** What one unit is, for example "1,000 tokens" or "GPU second". */
  unit: string;
  payTo: Address;
  facilitator: Address;
}

export interface ArlService {
  name: string;
  description: string;
  endpoint: string;
  terms: ArlTerms;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function text(v: unknown, field: string, max: number, required = true): string {
  if (typeof v !== "string") throw new Error(`${field} must be text`);
  const s = v.trim();
  if (required && s === "") throw new Error(`${field} is required`);
  if (s.length > max) throw new Error(`${field} is longer than ${String(max)} characters`);
  // No control characters (they could hide text or break layout).
  if (/\p{Cc}/u.test(s)) throw new Error(`${field} contains control characters`);
  return s;
}

function address(v: unknown, field: string): Address {
  if (typeof v !== "string" || !isAddress(v)) throw new Error(`${field} is not an address`);
  return getAddress(v);
}

/** Only https, or http on this machine (local development), is shown as a link. */
export function safeEndpoint(v: unknown): string {
  const s = text(v, "endpoint", LIMITS.endpoint);
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error("endpoint is not a URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!(url.protocol === "https:" || (url.protocol === "http:" && local))) {
    throw new Error("endpoint must use https");
  }
  if (url.username || url.password) throw new Error("endpoint must not contain credentials");
  return url.toString();
}

export function validateService(input: {
  name: unknown;
  description: unknown;
  endpoint: unknown;
  terms: {
    network: unknown;
    asset: unknown;
    unitPrice: unknown;
    unit: unknown;
    payTo: unknown;
    facilitator: unknown;
  };
}): ArlService {
  const t = input.terms;
  if (typeof t.network !== "string" || !/^eip155:\d{1,12}$/.test(t.network)) {
    throw new Error("network must be a CAIP-2 eip155 chain");
  }
  let unitPrice: bigint;
  try {
    unitPrice = BigInt(t.unitPrice as string | bigint);
  } catch {
    throw new Error("unit price is not a whole number of base units");
  }
  if (unitPrice <= 0n) throw new Error("unit price must be above zero");
  if (unitPrice > 10n ** 30n) throw new Error("unit price is too large");
  return {
    name: text(input.name, "name", LIMITS.name),
    description: text(input.description, "description", LIMITS.description, false),
    endpoint: safeEndpoint(input.endpoint),
    terms: {
      version: 1,
      scheme: "upto",
      network: t.network,
      asset: address(t.asset, "asset"),
      unitPrice,
      unit: text(t.unit, "unit", LIMITS.unit),
      payTo: address(t.payTo, "payTo"),
      facilitator: address(t.facilitator, "facilitator"),
    },
  };
}

/** The ERC-8004 registration file for a service, as a base64 JSON data URI. An inactive file
 *  (active: false) takes a service off the list without deleting its identity. */
export function encodeRegistration(service: ArlService, active = true): string {
  const file = {
    type: REGISTRATION_TYPE,
    name: service.name,
    description: service.description,
    services: [{ name: "web", endpoint: service.endpoint }],
    x402Support: true,
    active,
    arl: {
      version: 1,
      scheme: "upto",
      network: service.terms.network,
      asset: service.terms.asset,
      unitPrice: service.terms.unitPrice.toString(),
      unit: service.terms.unit,
      payTo: service.terms.payTo,
      facilitator: service.terms.facilitator,
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(file));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const uri = DATA_URI_PREFIX + btoa(binary);
  if (uri.length > LIMITS.uri) throw new Error("registration file is too large");
  return uri;
}

/** Reads an agent's tokenURI as an ARL service. Anything else (other agents, other URI
 *  schemes, malformed files) is reported as not an ARL service. */
export function parseRegistration(uri: string): Parsed<ArlService> {
  try {
    if (uri.length > LIMITS.uri) throw new Error("registration file is too large");
    if (!uri.startsWith(DATA_URI_PREFIX)) throw new Error("not an on-chain JSON registration");
    const binary = atob(uri.slice(DATA_URI_PREFIX.length));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const file = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<
      string,
      unknown
    >;
    if (file.type !== REGISTRATION_TYPE) throw new Error("not an ERC-8004 registration file");
    if (file.active === false) throw new Error("service is not active");
    const arl = file.arl as Record<string, unknown> | undefined;
    if (!arl || arl.version !== 1 || arl.scheme !== "upto") throw new Error("no ARL terms");
    const web = Array.isArray(file.services)
      ? (file.services as { name?: unknown; endpoint?: unknown }[]).find((s) => s.name === "web")
      : undefined;
    return {
      ok: true,
      value: validateService({
        name: file.name,
        description: file.description ?? "",
        endpoint: web?.endpoint,
        terms: {
          network: arl.network,
          asset: arl.asset,
          unitPrice:
            typeof arl.unitPrice === "string" && /^\d+$/.test(arl.unitPrice) ? arl.unitPrice : "x",
          unit: arl.unit,
          payTo: arl.payTo,
          facilitator: arl.facilitator,
        },
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unreadable registration" };
  }
}

/** The subset of the ERC-8004 IdentityRegistry the app uses. */
export const identityRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "URIUpdated",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "newURI", type: "string", indexed: false },
      { name: "updatedBy", type: "address", indexed: true },
    ],
  },
] as const;
