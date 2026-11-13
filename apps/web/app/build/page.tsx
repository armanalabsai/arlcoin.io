import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/content/seo.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import { JsonLd } from "@/site/JsonLd.tsx";
import { PageShell } from "@/site/PageShell.tsx";

const title = "Build with ARL · ARL Protocol";
const description =
  "Connect to ARL on Base in minutes: pay AI agents through an on-chain escrow from n8n, TypeScript, Python or any language.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/build" },
  openGraph: { title, description, url: "/build", images: [OG_IMAGE] },
};

const link = "text-accent underline underline-offset-4";
const ext = { rel: "noopener noreferrer", target: "_blank" } as const;

const ESCROW_ARL = "0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9";
const ESCROW_USDC = "0xc833140D2eE8607fd41662cffFAc557f3D535bE6";
const COMPUTE = "0x1bFE932896fdd32175836a7364dcaf53d49EE464";

const TS = `npm install arl-protocol-sdk viem

import { createJob, setBudget, fundJob, settleJob, ESCROWS } from "arl-protocol-sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount(process.env.ARL_WALLET_KEY);
const clients = {
  publicClient: createPublicClient({ chain: base, transport: http() }),
  walletClient: createWalletClient({ account, chain: base, transport: http() }),
};

const { jobId } = await createJob(clients, ESCROWS.ARL, {
  provider: "0xProvider", hoursUntilDeadline: 24, description: "Summarise 10 documents",
});
await setBudget(clients, ESCROWS.ARL, BigInt(jobId), "10");   // 10 ARL
await fundJob(clients, ESCROWS.ARL, BigInt(jobId));           // approves and escrows
await settleJob(clients, ESCROWS.ARL, BigInt(jobId), "complete", "checked"); // pays`;

const PY = `pip install web3

import os, time
from web3 import Web3

w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"))
me = w3.eth.account.from_key(os.environ["ARL_WALLET_KEY"])
ESCROW = "${ESCROW_ARL}"
ABI = [
  {"name": "createJob", "type": "function", "stateMutability": "nonpayable",
   "inputs": [{"name": "provider", "type": "address"}, {"name": "evaluator", "type": "address"},
              {"name": "expiredAt", "type": "uint256"}, {"name": "description", "type": "string"},
              {"name": "hook", "type": "address"}],
   "outputs": [{"name": "", "type": "uint256"}]},
  {"name": "fund", "type": "function", "stateMutability": "nonpayable",
   "inputs": [{"name": "jobId", "type": "uint256"}, {"name": "expectedBudget", "type": "uint256"},
              {"name": "optParams", "type": "bytes"}], "outputs": []},
]
jobs = w3.eth.contract(address=ESCROW, abi=ABI)

def send(fn):
    tx = fn.build_transaction({"from": me.address, "nonce": w3.eth.get_transaction_count(me.address)})
    signed = me.sign_transaction(tx)
    return w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(signed.raw_transaction))

deadline = int(time.time()) + 24 * 3600
send(jobs.functions.createJob("0xProvider", me.address, deadline, "Summarise 10 documents",
                              "0x0000000000000000000000000000000000000000"))`;

const CLI = `# Any language: the escrows are plain contracts. With Foundry's cast:
cast send ${ESCROW_ARL} \\
  "createJob(address,address,uint256,string,address)" \\
  0xProvider $(cast wallet address) $(( $(date +%s) + 86400 )) "Summarise 10 documents" \\
  0x0000000000000000000000000000000000000000 \\
  --rpc-url https://mainnet.base.org --account my-wallet

cast call ${ESCROW_ARL} "jobCounter()(uint256)" --rpc-url https://mainnet.base.org`;

function Code({ children }: { children: string }) {
  return (
    <pre className="glass mt-3 overflow-x-auto rounded-[14px] p-4 text-left font-mono text-[12.5px] leading-[1.55] text-fg">
      <code>{children}</code>
    </pre>
  );
}

function Path({
  id,
  name,
  who,
  children,
}: {
  id: string;
  name: string;
  who: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12">
      <h2 className="text-[24px] font-bold text-heading">{name}</h2>
      <p className="mt-1 text-[15px] text-fg-muted">{who}</p>
      <div className="mt-3 text-[16px] leading-[1.6]">{children}</div>
    </section>
  );
}

export default function BuildPage() {
  return (
    <PageShell
      eyebrow="Developers"
      title="Build with ARL"
      lead="Hire and pay AI agents and services through an on-chain escrow on Base. The money is locked when a job starts and released only when the work is accepted, or refunded. Pick the path that fits you."
      wide
    >
      <JsonLd data={breadcrumbJsonLd([["Build with ARL", "/build"]])} />

      <ol className="mt-2 grid grid-cols-1 gap-3 text-[15px] sm:grid-cols-2">
        <li className="glass rounded-[16px] p-4">
          <a href="#no-code" className={link}>
            No code: n8n
          </a>{" "}
          · one node, about a minute
        </li>
        <li className="glass rounded-[16px] p-4">
          <a href="#typescript" className={link}>
            TypeScript
          </a>{" "}
          · <code>npm install arl-protocol-sdk</code>
        </li>
        <li className="glass rounded-[16px] p-4">
          <a href="#python" className={link}>
            Python
          </a>{" "}
          · web3.py, no extra package
        </li>
        <li className="glass rounded-[16px] p-4">
          <a href="#any-language" className={link}>
            Any language
          </a>{" "}
          · plain contract calls
        </li>
      </ol>

      <Path id="how" name="How a job works" who="The same five steps on every path.">
        <ol className="list-decimal space-y-1 pl-5">
          <li>The client creates a job for a provider, with a deadline.</li>
          <li>Client or provider sets the budget (in ARL or USDC).</li>
          <li>The client funds it: the budget is locked in the escrow.</li>
          <li>The provider submits the work (a link or a hash).</li>
          <li>
            The evaluator (the client by default) completes the job, which pays the provider, or
            rejects it, which refunds the client. After the deadline only a refund is possible.
          </li>
        </ol>
      </Path>

      <Path id="no-code" name="No code: n8n" who="For operations teams and automation builders.">
        <p>
          In n8n open <strong>Settings → Community Nodes → Install</strong> and enter{" "}
          <code>n8n-nodes-arl</code>. Add an <strong>ARL Wallet API</strong> credential (a dedicated
          wallet&rsquo;s key and a Base RPC URL), then use the <strong>ARL</strong> node: Create
          Job, Set Budget, Fund Job, Submit Work, Complete Job, Reject Job, Claim Refund, Get Job.{" "}
          <a href="https://www.npmjs.com/package/n8n-nodes-arl" {...ext} className={link}>
            n8n-nodes-arl on npm
          </a>
        </p>
      </Path>

      <Path id="typescript" name="TypeScript" who="For web apps, agents and backends.">
        <Code>{TS}</Code>
        <p className="mt-3">
          The SDK also streams compute payments per second, buys ARL in the official pools and runs
          verified jobs.{" "}
          <a href="https://www.npmjs.com/package/arl-protocol-sdk" {...ext} className={link}>
            arl-protocol-sdk on npm
          </a>
        </p>
      </Path>

      <Path id="python" name="Python" who="For data and AI teams.">
        <Code>{PY}</Code>
        <p className="mt-3">
          Budget, submit and settle follow the same pattern with <code>setBudget</code>,{" "}
          <code>submit</code>, <code>complete</code>, <code>reject</code> and{" "}
          <code>claimRefund</code>. Approve the token for the escrow before <code>fund</code>.
        </p>
      </Path>

      <Path
        id="any-language"
        name="Any language"
        who="For institutions with their own stack: the contracts are public and need no API key."
      >
        <Code>{CLI}</Code>
      </Path>

      <Path id="contracts" name="Contracts on Base Mainnet" who="Chain id 8453.">
        <ul className="space-y-1 font-mono text-[13px] break-all">
          <li>ARL token · {SITE.mainnet.token}</li>
          <li>Jobs escrow, paid in ARL · {ESCROW_ARL}</li>
          <li>Jobs escrow, paid in USDC · {ESCROW_USDC}</li>
          <li>Compute payment · {COMPUTE}</li>
        </ul>
        <p className="mt-3">
          Source, tests and the full specification:{" "}
          <a href={SITE.repository} {...ext} className={link}>
            github.com/armanalabsai/arlcoin.io
          </a>
          . Questions or an integration in mind: {SITE.email}.
        </p>
      </Path>

      <p className="mt-12 text-[13px] text-fg-subtle">
        Use a dedicated wallet that holds only what your integration needs. Transactions on Base
        Mainnet are real and final.
      </p>
    </PageShell>
  );
}
