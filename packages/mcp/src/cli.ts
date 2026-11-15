#!/usr/bin/env node
// arl-mcp: the ARL Protocol MCP server over stdio. Add it to an MCP client, for example:
//
//   { "mcpServers": { "arl": { "command": "npx", "args": ["-y", "arl-protocol-mcp"] } } }
//
// ARL_RPC_URL picks the Base RPC (default: public endpoints, the first answer wins). The server
// reads the chain and prepares unsigned transactions; it never holds a key or sends anything.

import process from "node:process";
import { createInterface } from "node:readline";

import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";

import { handleLine } from "./server.ts";
import { arlTools, type ChainReader } from "./tools.ts";

const PUBLIC_RPCS = [
  "https://base-rpc.publicnode.com",
  "https://mainnet.base.org",
  "https://base.drpc.org",
];

const urls = process.env.ARL_RPC_URL ? [process.env.ARL_RPC_URL] : PUBLIC_RPCS;
const chain = createPublicClient({
  chain: base,
  transport: fallback(urls.map((u) => http(u, { timeout: 10_000 }))),
}) as unknown as ChainReader;
const tools = arlTools({ chain });

// stdout carries protocol messages only; anything else goes to stderr.
const lines = createInterface({ input: process.stdin, terminal: false });
for await (const line of lines) {
  const out = await handleLine(line, tools);
  if (out !== null) process.stdout.write(`${out}\n`);
}
