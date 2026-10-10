import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";

import {
  concat,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  encodeFunctionResult,
  encodePacked,
  getAddress,
  getContractAddress,
  keccak256,
  pad,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import type { Artifact } from "../src/bytecode.ts";
import {
  RecordError,
  SAFE_ROLES,
  parseRunFile,
  requireVerified,
  verifyRun,
  writeRecordAtomically,
  type ArtifactName,
  type ChainReader,
  type RecordKind,
} from "../src/record.ts";

// A fake chain: code, storage and contract reads, all at any block. Each scenario builds the run
// file Foundry would write and the chain state that should (or should not) back it.

const abi = parseAbi([
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address)",
  "function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function proxyCreationCode() pure returns (bytes)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function paymentToken() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function owner() view returns (address)",
  "function cliffStart() view returns (uint64)",
  "function start() view returns (uint256)",
  "function duration() view returns (uint256)",
  "function getMinDelay() view returns (uint256)",
  "function token() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function claimEnd() view returns (uint64)",
  "function returnTo() view returns (address)",
]);

const addr = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const SENDER = addr(0xd0);

class FakeChain implements ChainReader {
  codes = new Map<string, Hex>();
  storage = new Map<string, Hex>();
  /** `${address}:${function}` → result. */
  reads = new Map<string, Hex>();
  creations = new Map<string, Hex>();
  id: number;
  version: string;
  constructor(id: number) {
    this.id = id;
    // The public Base Sepolia RPC answers with its own client (reth); local nodes are Anvil.
    this.version = id === 31337 ? "anvil/v1.8.3" : "reth/v2.5.2";
  }
  chainId = () => Promise.resolve(this.id);
  clientVersion = () => Promise.resolve(this.version);
  blockNumber = () => Promise.resolve(1_000n);
  code = (a: Address) => Promise.resolve(this.codes.get(a.toLowerCase()) ?? "0x");
  storageAt = (a: Address) => Promise.resolve(this.storage.get(a.toLowerCase()) ?? pad("0x0"));
  call = ({ to, data }: { to?: Address; data: Hex }) => {
    if (!to) {
      const r = this.creations.get(data.toLowerCase());
      return r ? Promise.resolve(r) : Promise.reject(new Error("creation reverted"));
    }
    const fn = decodeFunctionData({ abi, data }).functionName;
    const r = this.reads.get(`${to.toLowerCase()}:${fn}`);
    return r ? Promise.resolve(r) : Promise.reject(new Error("execution reverted"));
  };
  setRead(at: Address, fn: string, value: unknown) {
    this.reads.set(
      `${at.toLowerCase()}:${fn}`,
      encodeFunctionResult({ abi, functionName: fn as never, result: value as never }),
    );
  }
}

interface TxSpec {
  type: "CREATE" | "CALL";
  name?: string;
  to?: Address;
  address?: Address;
  input: Hex;
  nonce: number;
  extra?: { transactionType: string; address: Address; initCode: Hex }[];
}

function runFile(
  chain: number,
  txs: TxSpec[],
  receipts?: { status: number; mined?: boolean }[],
): unknown {
  const hash = (i: number) => keccak256(encodePacked(["uint256"], [BigInt(i + 1)]));
  return {
    chain,
    transactions: txs.map((t, i) => ({
      hash: receipts ? hash(i) : null,
      transactionType: t.type,
      contractName: t.name ?? null,
      contractAddress: t.address ?? t.to ?? null,
      additionalContracts: t.extra ?? [],
      transaction: {
        from: SENDER,
        to: t.to ?? null,
        input: t.input,
        nonce: `0x${t.nonce.toString(16)}`,
        chainId: `0x${chain.toString(16)}`,
      },
    })),
    receipts: (receipts ?? [])
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.mined !== false)
      .map(({ r, i }) => ({
        transactionHash: hash(i),
        status: `0x${r.status.toString(16)}`,
        contractAddress: txs[i]?.address ?? null,
        blockNumber: "0x10",
      })),
  };
}

const ok = (n: number) => Array.from({ length: n }, () => ({ status: 1 }));
const verify = (
  run: unknown,
  chain: FakeChain,
  kind: RecordKind,
  extra: Partial<Parameters<typeof verifyRun>[2]> = {},
) =>
  verifyRun(parseRunFile(run), chain, { kind, artifacts: ARTIFACTS, runFileHash: "ab", ...extra });
const failed = (r: Awaited<ReturnType<typeof verifyRun>>) =>
  r.findings.filter((f) => !f.ok).map((f) => `${f.check}: ${f.detail}`);

// ---------------------------------------------------------------- Safes (local Anvil)

const FACTORY = addr(0xfa);
const SINGLETON = addr(0x51);
const PROXY_CREATION = "0x608060aa" as Hex;
const PROXY_RUNTIME = "0x363d3d373d3d3d363d73" as Hex;
const OWNERS = [addr(0xa1), addr(0xa2), addr(0xa3)];
const GUARDIANS = [addr(0xb1), addr(0xb2)];

function safesScenario(chainId = 31337) {
  const chain = new FakeChain(chainId);
  chain.codes.set(FACTORY.toLowerCase(), "0x6001");
  chain.codes.set(SINGLETON.toLowerCase(), "0x6002");
  chain.setRead(FACTORY, "proxyCreationCode", PROXY_CREATION);
  const initCode = concat([
    PROXY_CREATION,
    encodeAbiParameters([{ type: "address" }], [SINGLETON]),
  ]);
  chain.creations.set(initCode.toLowerCase(), PROXY_RUNTIME);
  const txs: TxSpec[] = [];
  const proxies: Address[] = [];
  SAFE_ROLES.forEach((role, i) => {
    const owners = role === "guardian" ? GUARDIANS : OWNERS;
    const threshold = role === "guardian" ? 1n : 2n;
    const initializer = encodeFunctionData({
      abi,
      functionName: "setup",
      args: [owners, threshold, addr(0), "0x", addr(0), addr(0), 0n, addr(0)],
    });
    const saltNonce = BigInt(i + 1);
    const salt = keccak256(
      encodePacked(["bytes32", "uint256"], [keccak256(initializer), saltNonce]),
    );
    const proxy = getContractAddress({
      opcode: "CREATE2",
      from: FACTORY,
      salt,
      bytecode: initCode,
    });
    proxies.push(proxy);
    chain.codes.set(proxy.toLowerCase(), PROXY_RUNTIME);
    chain.storage.set(proxy.toLowerCase(), pad(SINGLETON));
    chain.setRead(proxy, "getOwners", owners);
    chain.setRead(proxy, "getThreshold", threshold);
    txs.push({
      type: "CALL",
      to: FACTORY,
      nonce: i,
      input: encodeFunctionData({
        abi,
        functionName: "createProxyWithNonce",
        args: [SINGLETON, initializer, saltNonce],
      }),
      extra: [{ transactionType: "CREATE2", address: proxy, initCode }],
    });
  });
  return { chain, txs, proxies };
}

// ---------------------------------------------------------------- ARL builds (synthetic)

/** A build whose runtime code ends with one 32-byte immutable. */
const build = (name: string, tag: string): Artifact => ({
  name,
  creation: `0x60${tag}60${tag}f3` as Hex,
  runtime: `0x5f5f${tag}${"00".repeat(32)}` as Hex,
  immutables: [[{ start: 3, length: 32 }]],
});
const ARTIFACTS: Partial<Record<ArtifactName, Artifact>> = {
  ComputePayment: build("ComputePayment", "c1"),
  ARLToken: build("ARLToken", "a1"),
  ARLVestingWallet: build("ARLVestingWallet", "a2"),
  ARLTimelock: build("ARLTimelock", "a3"),
  ARLMerkleDistributor: build("ARLMerkleDistributor", "a4"),
};
const deployedCode = (a: Artifact, immutable: Hex) =>
  concat([a.runtime.slice(0, 8) as Hex, pad(immutable)]);
const created = (nonce: number) => getContractAddress({ from: SENDER, nonce: BigInt(nonce) });

function computePaymentScenario(chainId = 84532) {
  const chain = new FakeChain(chainId);
  const token = addr(0x70);
  const at = created(7);
  const a = ARTIFACTS.ComputePayment as Artifact;
  chain.codes.set(at.toLowerCase(), deployedCode(a, token));
  chain.setRead(at, "paymentToken", token);
  const tx: TxSpec = {
    type: "CREATE",
    name: "ComputePayment",
    address: at,
    nonce: 7,
    input: concat([a.creation, encodeAbiParameters([{ type: "address" }], [token])]),
  };
  return { chain, tx, at, token };
}

function arlScenario() {
  const chain = new FakeChain(84532);
  const [v1, v2, tl, tk] = [created(12), created(13), created(14), created(15)];
  const A = ARTIFACTS as Record<ArtifactName, Artifact>;
  const vest = (beneficiary: Address, nonce: number, at: Address): TxSpec => {
    chain.codes.set(at.toLowerCase(), deployedCode(A.ARLVestingWallet, beneficiary));
    chain.setRead(at, "owner", beneficiary);
    chain.setRead(at, "cliffStart", 100n);
    chain.setRead(at, "start", 200n);
    chain.setRead(at, "duration", 300n);
    return {
      type: "CREATE",
      name: "ARLVestingWallet",
      address: at,
      nonce,
      input: concat([
        A.ARLVestingWallet.creation,
        encodeAbiParameters(
          [{ type: "address" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
          [beneficiary, 100n, 200n, 500n],
        ),
      ]),
    };
  };
  const txs = [vest(addr(0xe1), 12, v1), vest(addr(0xe2), 13, v2)];
  chain.codes.set(tl.toLowerCase(), deployedCode(A.ARLTimelock, "0x01"));
  chain.setRead(tl, "getMinDelay", 172_800n);
  txs.push({
    type: "CREATE",
    name: "ARLTimelock",
    address: tl,
    nonce: 14,
    input: concat([
      A.ARLTimelock.creation,
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address[]" }, { type: "address[]" }, { type: "address" }],
        [172_800n, [addr(0xe3)], [addr(0xe3)], addr(0xe4)],
      ),
    ]),
  });
  const recipients = Array.from({ length: 11 }, (_, i) => addr(0xf00 + i));
  recipients[6] = v1;
  recipients[3] = v2;
  recipients[7] = tl;
  chain.codes.set(tk.toLowerCase(), deployedCode(A.ARLToken, "0x02"));
  chain.setRead(tk, "totalSupply", 21_000_000n * 10n ** 18n);
  chain.setRead(tk, "symbol", "ARL");
  chain.setRead(tk, "decimals", 18);
  txs.push({
    type: "CREATE",
    name: "ARLToken",
    address: tk,
    nonce: 15,
    input: concat([
      A.ARLToken.creation,
      encodeAbiParameters(
        [{ type: "tuple", components: Array.from({ length: 11 }, () => ({ type: "address" })) }],
        [recipients] as never,
      ),
    ]),
  });
  return { chain, txs, v1, v2, tl, tk };
}

// ---------------------------------------------------------------- tests

describe("verified record: Safes", () => {
  it("successful broadcast: every Safe's code, owners and threshold check out", async () => {
    const { chain, txs, proxies } = safesScenario();
    const r = await verify(runFile(31337, txs, ok(12)), chain, "safes", { localAnvil: true });
    assert.deepEqual(failed(r), []);
    const rec = r.record;
    assert.ok(rec);
    assert.equal(rec.verified.network, "local-anvil-rehearsal");
    assert.equal((rec.safes as Record<string, string>).guardian, proxies[4]);
    assert.equal(rec.singleton, SINGLETON);
  });

  it("phone-signed dry run (no receipts): accepted only because every Safe is on chain", async () => {
    const { chain, txs } = safesScenario();
    const r = await verify(runFile(31337, txs), chain, "safes", { localAnvil: true });
    assert.equal(r.ok, true);
  });

  it("dry run that was never sent: no code, no record", async () => {
    const { chain, txs, proxies } = safesScenario();
    for (const p of proxies) chain.codes.delete(p.toLowerCase());
    const r = await verify(runFile(31337, txs), chain, "safes", { localAnvil: true });
    assert.equal(r.ok, false);
    assert.equal(r.record, undefined);
    assert.equal(failed(r).filter((f) => f.includes("has code")).length, 12);
  });

  it("missing contract code at one Safe", async () => {
    const { chain, txs, proxies } = safesScenario();
    chain.codes.delete((proxies[9] as Address).toLowerCase());
    const r = await verify(runFile(31337, txs, ok(12)), chain, "safes", { localAnvil: true });
    assert.deepEqual(
      failed(r).map((f) => f.split(":")[0]),
      ["team Safe has code"],
    );
  });

  it("wrong bytecode at a Safe address", async () => {
    const { chain, txs, proxies } = safesScenario();
    chain.codes.set((proxies[0] as Address).toLowerCase(), "0x363d3d37ff");
    const r = await verify(runFile(31337, txs, ok(12)), chain, "safes", { localAnvil: true });
    assert.deepEqual(
      failed(r).map((f) => f.split(":")[0]),
      ["founder Safe runs the factory's proxy code"],
    );
  });

  it("wrong Safe owners and wrong threshold", async () => {
    const { chain, txs, proxies } = safesScenario();
    chain.setRead(proxies[1] as Address, "getOwners", [OWNERS[0], OWNERS[1], addr(0xbad)]);
    chain.setRead(proxies[4] as Address, "getThreshold", 2n);
    const r = await verify(runFile(31337, txs, ok(12)), chain, "safes", { localAnvil: true });
    assert.deepEqual(
      failed(r).map((f) => f.split(":")[0]),
      ["investors Safe owners", "guardian Safe getThreshold()"],
    );
  });

  it("failed transaction (receipt status 0)", async () => {
    const { chain, txs } = safesScenario();
    const receipts = ok(12);
    receipts[3] = { status: 0 };
    const r = await verify(runFile(31337, txs, receipts), chain, "safes", { localAnvil: true });
    assert.deepEqual(
      failed(r).map((f) => f.split(":")[0]),
      ["transaction 4 succeeded"],
    );
  });

  it("partial failure: the broadcast stopped after six Safes", async () => {
    const { chain, txs, proxies } = safesScenario();
    const receipts = ok(12).map((r, i) => (i < 6 ? r : { status: 1, mined: false }));
    for (const p of proxies.slice(6)) chain.codes.delete(p.toLowerCase());
    const r = await verify(runFile(31337, txs, receipts), chain, "safes", { localAnvil: true });
    assert.equal(r.ok, false);
    const f = failed(r);
    assert.equal(f.filter((x) => x.includes("did not complete")).length, 6);
    assert.equal(f.filter((x) => x.includes("has code")).length, 6);
  });

  it("a run with fewer Safes, or a different setup, is not a Safes run", async () => {
    const { chain, txs } = safesScenario();
    const r = await verify(runFile(31337, txs.slice(0, 11)), chain, "safes", { localAnvil: true });
    assert.deepEqual(
      failed(r).map((f) => f.split(":")[0]),
      ["run creates exactly 12 Safes"],
    );
  });
});

describe("verified record: ARL contracts", () => {
  it("successful broadcast of ComputePayment on Base Sepolia", async () => {
    const { chain, tx, at, token } = computePaymentScenario();
    const r = await verify(runFile(84532, [tx], ok(1)), chain, "compute-payment");
    assert.deepEqual(failed(r), []);
    assert.deepEqual(
      { ...r.record, verified: undefined },
      {
        chainId: 84532,
        blockNumber: 16,
        paymentToken: token,
        ComputePayment: at,
        verified: undefined,
      },
    );
  });

  it("dry run that was never sent: no code at the address", async () => {
    const { chain, tx, at } = computePaymentScenario();
    chain.codes.delete(at.toLowerCase());
    const r = await verify(runFile(84532, [tx]), chain, "compute-payment");
    assert.equal(r.ok, false);
    assert.match(
      failed(r).join("\n"),
      /runtime code is the ComputePayment build: no code at the address/,
    );
  });

  it("wrong bytecode: other runtime code, or other creation code sent", async () => {
    const s = computePaymentScenario();
    s.chain.codes.set(s.at.toLowerCase(), `0x5f5fc2${"00".repeat(32)}`);
    const r = await verify(runFile(84532, [s.tx], ok(1)), s.chain, "compute-payment");
    assert.match(failed(r).join("\n"), /runtime code differs from the build/);
    const t = computePaymentScenario();
    t.tx.input = `0x60c160c2f3${t.tx.input.slice(12)}` as Hex;
    const q = await verify(runFile(84532, [t.tx], ok(1)), t.chain, "compute-payment");
    assert.match(failed(q).join("\n"), /creation code is the ComputePayment build/);
  });

  it("failed transaction", async () => {
    const { chain, tx } = computePaymentScenario();
    const r = await verify(runFile(84532, [tx], [{ status: 0 }]), chain, "compute-payment");
    assert.deepEqual(
      failed(r).map((f) => f.split(":")[0]),
      ["transaction 1 succeeded"],
    );
  });

  it("successful ARL system: vesting wallets and treasury taken from the token's own arguments", async () => {
    const { chain, txs, v1, v2, tl, tk } = arlScenario();
    const r = await verify(runFile(84532, txs, ok(4)), chain, "arl");
    assert.deepEqual(failed(r), []);
    const rec = r.record;
    assert.ok(rec);
    assert.equal(rec.investorsVesting, v1);
    assert.equal(rec.partnershipsVesting, v2);
    assert.equal(rec.timelock, tl);
    assert.equal(rec.token, tk);
    assert.equal(rec.deployer, SENDER);
  });

  it("partial ARL broadcast: the token was never created", async () => {
    const { chain, txs, tk } = arlScenario();
    chain.codes.delete(tk.toLowerCase());
    const r = await verify(
      runFile(84532, txs, [...ok(3), { status: 1, mined: false }]),
      chain,
      "arl",
    );
    assert.equal(r.ok, false);
    assert.match(failed(r).join("\n"), /transaction 4 mined: no receipt/);
    assert.match(failed(r).join("\n"), /token runtime code is the ARLToken build: no code/);
  });

  it("a vesting wallet whose beneficiary on chain differs from its constructor argument", async () => {
    const { chain, txs, v2 } = arlScenario();
    chain.setRead(v2, "owner", addr(0xbad));
    const r = await verify(runFile(84532, txs, ok(4)), chain, "arl");
    assert.deepEqual(
      failed(r).map((f) => f.split(":")[0]),
      ["partnerships vesting owner()"],
    );
  });
});

describe("verified record: networks", () => {
  it("every chain except Base Sepolia, Base Mainnet and local Anvil is refused before any check", async () => {
    for (const id of [1, 10, 137, 11_155_111]) {
      const { chain, tx } = computePaymentScenario(id);
      await assert.rejects(
        verify(runFile(id, [tx], ok(1)), chain, "compute-payment"),
        /Base Sepolia \(84532\) and Base Mainnet \(8453\) only/,
      );
    }
  });

  it("local Anvil only with the rehearsal flag, and only when the node is Anvil", async () => {
    const { chain, txs } = safesScenario();
    await assert.rejects(verify(runFile(31337, txs), chain, "safes"), /--local-anvil/);
    chain.version = "Geth/v1.14";
    await assert.rejects(
      verify(runFile(31337, txs), chain, "safes", { localAnvil: true }),
      /not served by Anvil/,
    );
  });

  it("an Anvil fork of Base Sepolia is a rehearsal, never a Base Sepolia record", async () => {
    const { chain, tx } = computePaymentScenario(84532);
    chain.version = "anvil/v1.8.3";
    await assert.rejects(
      verify(runFile(84532, [tx], ok(1)), chain, "compute-payment"),
      /local Anvil fork, not Base Sepolia/,
    );
    const r = await verify(runFile(84532, [tx], ok(1)), chain, "compute-payment", {
      localAnvil: true,
    });
    assert.equal(r.record?.verified.network, "base-sepolia-fork-rehearsal");
    chain.version = "reth/v2.5.2";
    const real = await verify(runFile(84532, [tx], ok(1)), chain, "compute-payment");
    assert.equal(real.record?.verified.network, "base-sepolia");
  });

  it("Base Mainnet is a record of the public network; an Anvil fork of it is a rehearsal", async () => {
    const { chain, tx } = computePaymentScenario(8453);
    const real = await verify(runFile(8453, [tx], ok(1)), chain, "compute-payment");
    assert.equal(real.ok, true);
    assert.equal(real.record?.verified.network, "base-mainnet");
    chain.version = "anvil/v1.8.3";
    await assert.rejects(
      verify(runFile(8453, [tx], ok(1)), chain, "compute-payment"),
      /local Anvil fork, not Base Mainnet/,
    );
    const fork = await verify(runFile(8453, [tx], ok(1)), chain, "compute-payment", {
      localAnvil: true,
    });
    assert.equal(fork.record?.verified.network, "base-mainnet-fork-rehearsal");
  });

  it("the RPC must serve the run file's chain", async () => {
    const { chain, tx } = computePaymentScenario(84532);
    await assert.rejects(
      verify(runFile(31337, [tx], ok(1)), chain, "compute-payment"),
      /is not the run file's chain/,
    );
  });

  it("consumers accept only a stamped record of the right kind and chain", async () => {
    const { chain, tx } = computePaymentScenario();
    const r = await verify(runFile(84532, [tx], ok(1)), chain, "compute-payment");
    requireVerified(r.record, "compute-payment");
    assert.throws(() => {
      requireVerified(r.record, "safes");
    }, RecordError);
    assert.throws(() => {
      requireVerified({ ...r.record, chainId: 1 }, "compute-payment");
    }, RecordError);
    assert.throws(() => {
      requireVerified({ chainId: 84532 }, "compute-payment");
    }, RecordError);
  });

  it("malformed run files are rejected, not guessed", () => {
    assert.throws(() => parseRunFile({ chain: 84532, transactions: [] }), /no transactions/);
    assert.throws(() => parseRunFile({ transactions: [{}] }), /no chain id/);
    assert.throws(
      () =>
        parseRunFile({
          chain: 84532,
          transactions: [
            { transactionType: "CREATE", transaction: { input: "0x", nonce: "0x0", from: "nope" } },
          ],
        }),
      /sender is not an address/,
    );
  });
});

// ---------------------------------------------------------------- CLI against a JSON-RPC server

/** Serves a FakeChain over JSON-RPC, so the CLI runs exactly as against a real node. */
function serve(chain: FakeChain): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      const { id, method, params } = JSON.parse(body) as {
        id: number;
        method: string;
        params: unknown[];
      };
      const p = params as [never, never];
      const answer = async (): Promise<unknown> => {
        if (method === "eth_chainId") return `0x${(await chain.chainId()).toString(16)}`;
        if (method === "web3_clientVersion") return chain.clientVersion();
        if (method === "eth_blockNumber") return `0x${(await chain.blockNumber()).toString(16)}`;
        if (method === "eth_getCode") return chain.code(p[0]);
        if (method === "eth_getStorageAt") return chain.storageAt(p[0]);
        if (method === "eth_call") return chain.call(p[0]);
        throw new Error(`unexpected ${method}`);
      };
      answer().then(
        (result) => res.end(JSON.stringify({ jsonrpc: "2.0", id, result })),
        (e: unknown) =>
          res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: 3, message: String(e) } })),
      );
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${String(typeof a === "object" && a ? a.port : 0)}`,
      });
    }),
  );
}

describe("record-cli: writes only a fully verified record", () => {
  const cli = new URL("../src/record-cli.ts", import.meta.url).pathname;
  const run = promisify(execFile);
  const dir = mkdtempSync(join(tmpdir(), "arl-record-"));
  const good = safesScenario();
  let rpc: { server: Server; url: string };
  before(async () => {
    rpc = await serve(good.chain);
  });
  after(() => rpc.server.close());
  const exec = async (runPath: string, out: string) => {
    try {
      const r = await run("node", [cli, "safes", runPath, rpc.url, out, "--local-anvil"]);
      return { code: 0, out: r.stdout };
    } catch (e) {
      const err = e as { code: number; stdout: string; stderr: string };
      return { code: err.code, out: err.stdout + err.stderr };
    }
  };

  it("writes the record when every check passes, with no temporary file left", async () => {
    const runPath = join(dir, "run.json");
    writeFileSync(runPath, JSON.stringify(runFile(31337, good.txs, ok(12))));
    const out = join(dir, "31337-safes.json");
    const r = await exec(runPath, out);
    assert.equal(r.code, 0, r.out);
    const record = JSON.parse(readFileSync(out, "utf8")) as {
      verified: { kind: string; checks: number };
    };
    assert.equal(record.verified.kind, "safes");
    assert.ok(record.verified.checks > 100);
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.includes(".tmp-")),
      [],
    );
  });

  it("a failed check leaves the existing valid record byte for byte", async () => {
    const out = join(dir, "31337-safes.json");
    const before = readFileSync(out, "utf8");
    const bad = runFile(31337, good.txs, ok(12)) as { receipts: { status: string }[] };
    (bad.receipts[11] as { status: string }).status = "0x0";
    const runPath = join(dir, "bad-run.json");
    writeFileSync(runPath, JSON.stringify(bad));
    const r = await exec(runPath, out);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /record not written/);
    assert.equal(readFileSync(out, "utf8"), before);
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.includes(".tmp-")),
      [],
    );
  });

  it("an unreadable run file writes nothing", async () => {
    const out = join(dir, "never.json");
    const runPath = join(dir, "broken.json");
    writeFileSync(runPath, "{ not json");
    const r = await exec(runPath, out);
    assert.equal(r.code, 1);
    assert.equal(existsSync(out), false);
  });

  it("the atomic write replaces a record only with a complete one", () => {
    const out = join(dir, "atomic.json");
    writeFileSync(out, "old");
    writeRecordAtomically(out, { chainId: 84532 });
    assert.equal(readFileSync(out, "utf8"), '{\n  "chainId": 84532\n}\n');
  });
});
