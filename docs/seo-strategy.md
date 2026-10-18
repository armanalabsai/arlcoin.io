# ARL Protocol SEO strategy (zero budget)

Owner: project lead. Date: 2026-10-16. Scope: arlcoin.io, X @arlprotocol, Telegram
t.me/arlcoin_community, Farcaster, Mirror.xyz, GitHub armanalabsai/arlcoin.io.

Fixed facts (the same in every piece of content): ARL is an ERC-20 on Base; fixed supply
21,000,000 ARL; no mint, burn, pause or upgrade; treasury in a 2-of-3 Safe behind a 48-hour
timelock; Base Mainnet target **23 October 2026**; the Uniswap on Base pools open from 0.20 USD;
**no airdrop at launch** (an airdrop of 500,000 ARL follows at a later date, with rules announced
separately). Official channels: https://arlcoin.io · https://x.com/arlprotocol ·
https://t.me/arlcoin_community · team@arlcoin.io.

Content rules: no price promises, no "will be listed" promises, no airdrop promises; every
technical claim links to code, a test or a document in the repository (see
[content-standard.md](content-standard.md)).

Applied on the site together with this document: title and description length limits (guarded by
a test), site-wide `Organization` and `WebSite` JSON-LD, `TechArticle` and `BreadcrumbList` on
document pages, `BreadcrumbList` on Core cards, `FAQPage` on the FAQ, `manifest.webmanifest`,
sitemap priority and frequency hints, a `robots.txt` open to AI crawlers, an official-channels
section in `llms.txt`, and 301 redirects for the removed `/core/team` URLs.

---

## 1. Keyword research

Volumes are **estimates** from free tools (Google Keyword Planner ranges, Google Trends, early
Search Console data, X search results); they are updated every month from Search Console after
the launch. Brand keywords have low volume today but are the easiest to rank for and convert
best; searches spike on launch day (23 October).

| #   | Keyword                                | Category   | Monthly volume (estimate) | Difficulty | Target page        |
| --- | -------------------------------------- | ---------- | ------------------------: | ---------- | ------------------ |
| 1   | ARL Protocol                           | Brand      |                    50–200 | Low        | /                  |
| 2   | ARL token                              | Brand      |                   100–500 | Low        | /core/token        |
| 3   | ARL coin                               | Brand      |                   100–500 | Medium     | /                  |
| 4   | arlcoin                                | Brand      |                    20–100 | Low        | /                  |
| 5   | ARL crypto                             | Brand      |                    50–300 | Medium     | /                  |
| 6   | ARL price                              | Brand      |                 200–1,000 | Medium     | /buy               |
| 7   | buy ARL token                          | Brand      |                    50–200 | Low        | /buy               |
| 8   | ARL contract address                   | Brand      |                    20–100 | Low        | /buy               |
| 9   | ARL tokenomics                         | Brand      |                    20–100 | Low        | /docs/tokenomics   |
| 10  | ARL Base                               | Brand      |                     10–50 | Low        | /                  |
| 11  | how to buy ARL on Uniswap              | Long tail  |                     10–50 | Low        | /buy               |
| 12  | what is ARL Protocol                   | Long tail  |                     10–50 | Low        | /faq               |
| 13  | is ARL token safe                      | Long tail  |                     10–50 | Low        | /core/security     |
| 14  | when does ARL launch                   | Long tail  |                     10–50 | Low        | /faq               |
| 15  | how to add ARL to MetaMask             | Long tail  |                     10–50 | Low        | /buy               |
| 16  | how to pay for AI with crypto          | Long tail  |                   100–500 | Medium     | blog               |
| 17  | how to pay for GPU compute with crypto | Long tail  |                    50–200 | Medium     | blog               |
| 18  | what is a fixed supply token           | Long tail  |                   100–300 | Low        | blog               |
| 19  | how does a token timelock work         | Long tail  |                    50–150 | Low        | /docs/token-design |
| 20  | how to verify a token contract on Base | Long tail  |                    50–200 | Low        | blog               |
| 21  | Render token alternative               | Competitor |                   100–300 | Medium     | blog               |
| 22  | Akash Network alternative              | Competitor |                    50–200 | Medium     | blog               |
| 23  | Bittensor vs                           | Competitor |                 500–2,000 | High       | blog               |
| 24  | Virtuals Protocol alternative          | Competitor |                    50–200 | Medium     | blog               |
| 25  | io.net alternative                     | Competitor |                    50–150 | Medium     | blog               |
| 26  | AI agent tokens on Base                | Competitor |                   200–800 | High       | blog               |
| 27  | decentralized compute tokens           | Competitor |                   200–600 | High       | blog               |
| 28  | DePIN AI tokens                        | Competitor |                 500–1,500 | High       | blog               |
| 29  | AI crypto projects 2026                | Competitor |               1,000–5,000 | High       | blog               |
| 30  | x402 vs stablecoin payments            | Competitor |                    20–100 | Low        | /docs/payments     |
| 31  | Base network tokens                    | Base       |                 500–2,000 | High       | blog               |
| 32  | new tokens on Base                     | Base       |               1,000–3,000 | High       | /buy               |
| 33  | Base ecosystem projects                | Base       |                   300–900 | Medium     | /core/ecosystem    |
| 34  | Uniswap on Base                        | Base       |                 500–1,500 | High       | /buy               |
| 35  | Base Sepolia testnet tokens            | Base       |                   100–400 | Low        | /core/roadmap      |
| 36  | Base Sepolia faucet                    | Base       |               1,000–4,000 | Medium     | /app               |
| 37  | build on Base                          | Base       |                   300–800 | Medium     | GitHub README      |
| 38  | Coinbase L2 token launch               | Base       |                    50–200 | Medium     | blog               |
| 39  | Base mainnet launch October 2026       | Base       |                     10–50 | Low        | blog               |
| 40  | onchain AI payments Base               | Base       |                    20–100 | Low        | /core/technology   |
| 41  | x402 payments                          | Technical  |                   300–900 | Medium     | /docs/payments     |
| 42  | x402 upto scheme                       | Technical  |                     20–80 | Low        | /docs/payments     |
| 43  | ERC-8004 registry                      | Technical  |                   100–400 | Low        | /core/technology   |
| 44  | ERC-8183 job escrow                    | Technical  |                    20–100 | Low        | /docs/app          |
| 45  | Permit2 spending limit                 | Technical  |                   100–300 | Medium     | /docs/payments     |
| 46  | EIP-2612 permit token                  | Technical  |                   100–300 | Medium     | /docs/token-design |
| 47  | Semaphore anonymous signals            | Technical  |                    50–150 | Low        | /docs/zk-privacy   |
| 48  | Noir UltraHonk verifier                | Technical  |                    20–100 | Low        | /docs/zk-privacy   |
| 49  | Safe multisig timelock                 | Technical  |                   100–400 | Medium     | /docs/token-design |
| 50  | vesting wallet 12 month cliff          | Technical  |                    50–150 | Low        | /docs/tokenomics   |

**Priority order** (volume × conversion ÷ difficulty; winnable keywords first for a one-person
team):

1. Brand + transactional intent: `ARL token`, `ARL coin`, `buy ARL token`, `ARL contract address`,
   `ARL price` (searched on launch day; the /buy page must be ready).
2. Brand + informational: `ARL Protocol`, `what is ARL Protocol`, `ARL tokenomics`,
   `when does ARL launch`.
3. Technical niche (low competition, builds authority): `x402 upto scheme`, `ERC-8183 job escrow`,
   `ERC-8004 registry`, `Semaphore anonymous signals`.
4. Base ecosystem long tail: `onchain AI payments Base`, `Base Sepolia testnet tokens`,
   `Base mainnet launch October 2026`.
5. Competitor and comparison (months 2–3, once authority exists): `Render token alternative`,
   `Akash Network alternative`, `AI agent tokens on Base`.

### Next step

Open the "Performance" report in Search Console (already verified through the
`verification.google` meta tag) and write the top 10 queries next to the "Monthly volume" column
of this table.

---

## 2. On-page SEO checklist

Rules: title ≤ 60 characters, meta description ≤ 155 characters (`test/unit/seo.test.ts` checks
this on every build), one H1, H2s carry the keyword naturally, every page gives at least 3 internal
links. "About" and "Roadmap" are Core layers on the site (/core/technology, /core/roadmap); there
is no "Blog" yet, and its template is below (if Mirror.xyz is the canonical source, the copy on the
site gets a `canonical`).

| Page                     | Title (applied / proposed)                        | Meta description                                                                                                                                           | Schema                                  |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Home `/`                 | ARL Protocol (ARL) · AI and Compute Token on Base | ARL Protocol: the utility token for AI and compute payments on Base. 21,000,000 ARL fixed supply, no mint or upgrade. Base Mainnet launch 23 October 2026. | Organization, WebSite, FAQPage          |
| About `/core/technology` | Technology · ARL Protocol                         | How ARL pays for AI and compute on Base: x402 payments, ERC-8004 registry, ERC-8183 job escrow and zero-knowledge anonymous signals.                       | BreadcrumbList                          |
| Roadmap `/core/roadmap`  | Roadmap · ARL Protocol                            | Where ARL Protocol is today: Base Sepolia testnet live since 4 October 2026, Base Mainnet launch on 23 October 2026, services next.                        | BreadcrumbList                          |
| FAQ `/faq`               | ARL Token FAQ · ARL Protocol                      | ARL token FAQ: maximum supply, launch date, Base network, Uniswap trading, whitelist and airdrop timing, answered by ARL Protocol.                         | FAQPage, BreadcrumbList                 |
| Blog `/blog` (proposed)  | ARL Protocol Blog: AI Payments on Base            | Guides on paying for AI and compute with ARL on Base: x402, Permit2, token design and launch updates from ARL Protocol.                                    | Blog, BlogPosting, BreadcrumbList       |
| Contact `/contact`       | Contact · ARL Protocol                            | Contact ARL Protocol: email team@arlcoin.io, X @arlprotocol or the Telegram community for partnerships, press and listings.                                | Organization (contactPoint), Breadcrumb |
| Buy `/buy`               | How to Buy ARL on Uniswap on Base · ARL Protocol  | How to buy ARL: the official ARL/USDC, ARL/USDT, ARL/ETH and ARL/BTC pools on Uniswap on Base, from 0.20 USD, opening 23 October 2026.                     | BreadcrumbList                          |
| Documents `/docs/<slug>` | `<Doc title> · ARL Protocol`                      | The document's own `description` field                                                                                                                     | TechArticle, BreadcrumbList             |

**H1/H2 templates**

- Home: H1 "The onchain token planned for decentralized AI and compute services." · H2s:
  "Launch on Base." / "Onchain. Verifiable." / "Fixed. Forever." / "Built for AI and compute." /
  "Where ARL is today." / "Questions."
- FAQ: H1 "Questions" · every question is a `<summary>` (matches FAQPage).
- Blog post: H1 = post title (target keyword first) · H2s: "What is …", "How it works on Base",
  "Step by step", "FAQ" · a call to action at the end.
- /buy: H1 "How to get ARL" · H2s: "Before you buy", "Official pools", "Check the contract address".

**Internal link map**

- Home → /buy, /faq, /core/token, /docs/tokenomics, /whitelist.
- /faq → /buy (buying), /docs/tokenomics (supply), /core/roadmap (dates).
- Every document → /faq and the related Core card; every blog post → one document + /buy or
  /whitelist.
- Anchor text carries the keyword: "ARL tokenomics", "how to buy ARL on Uniswap", "x402 payments".

**Blog post JSON-LD template**

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "How to Pay for AI with Crypto on Base",
  "description": "A step-by-step guide to usage-based AI payments with ARL, x402 and Permit2 on Base.",
  "datePublished": "2026-10-20",
  "author": { "@id": "https://arlcoin.io/#organization" },
  "publisher": { "@id": "https://arlcoin.io/#organization" },
  "mainEntityOfPage": "https://arlcoin.io/blog/pay-for-ai-with-crypto-on-base/",
  "image": "https://arlcoin.io/opengraph-image.png"
}
```

### Next step

Rebuild as soon as the mainnet contract address is set in `SITE.mainnet.token` on 23 October;
the /buy page is the answer to the "ARL contract address" search.

---

## 3. Technical SEO checklist

| Area            | Status / step                                                                                                                                            | Free tool                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Site speed      | Static Next.js export, self-hosted fonts. Target: mobile LCP < 2.5 s, CLS < 0.1, INP < 200 ms. Serve images as WebP/AVIF as well as PNG.                 | PageSpeed Insights, Lighthouse (Chrome DevTools) |
| Mobile          | The end-to-end tests check horizontal scrolling and 44 px touch targets on the Pixel 7 profile.                                                          | Lighthouse mobile, Chrome device mode            |
| Indexing        | Submit the sitemap in Search Console; on launch day use "URL inspection → Request indexing" for /, /buy and /faq. For Bing: `node scripts/indexnow.mjs`. | Google Search Console, Bing Webmaster, IndexNow  |
| sitemap.xml     | Generated by `app/sitemap.ts`; every URL ends in `/`, the same as the canonical; priority and frequency hints added.                                     | Screaming Frog (free up to 500 URLs)             |
| robots.txt      | Open to all crawlers; AI search crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended …) explicitly allowed; `Sitemap:` and `Host:` lines present. | Search Console robots.txt report                 |
| Canonical       | `alternates.canonical` on every page; `x-default` and `en` hreflang at the root.                                                                         | Screaming Frog "Canonicals" tab                  |
| HTTPS           | Vercel TLS, CSP `upgrade-insecure-requests`, HSTS with subdomains; check the `www` → apex redirect in DNS.                                               | SSL Labs, securityheaders.com                    |
| Structured data | Organization, WebSite, FAQPage, TechArticle, BreadcrumbList.                                                                                             | Rich Results Test, Schema Markup Validator       |
| 404 / redirects | The removed `/core/team` URLs redirect with 301 to `/core/`.                                                                                             | Screaming Frog "Response codes"                  |
| AI visibility   | `/llms.txt` is current with the official channels and launch facts.                                                                                      | "ARL Protocol" search in Perplexity / ChatGPT    |

### Next step

Run the mobile test for `https://arlcoin.io/` on https://pagespeed.web.dev/ and note the LCP
element; if it is above 2.5 s, shrinking that element comes first.

---

## 4. Content calendar (12 weeks, English)

Every week: 1 blog post (canonical on the site or on Mirror), 1 X/Farcaster thread, 1 Mirror
article. Calls to action change with the funnel: Telegram and whitelist before the launch, /buy
and the app after it.

| Week (start) | Blog title · target keyword                                                                | X/Farcaster thread                                              | Mirror article                                             | Internal link · CTA                                      |
| ------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 1 (19 Oct)   | **ARL Protocol Launches on Base on 23 October: What to Know** · `ARL token`                | "ARL launch day in 8 posts: supply, pools, address check"       | "Why ARL launches with no airdrop"                         | /buy, /faq · "Join t.me/arlcoin_community"               |
| 2 (26 Oct)   | **How to Buy ARL on Uniswap on Base, Safely** · `how to buy ARL on Uniswap`                | "5 checks before you swap any new Base token"                   | "Single-sided liquidity from 0.20 USD, explained"          | /buy · "Verify the address on arlcoin.io/buy"            |
| 3 (2 Nov)    | **What Is a Fixed Supply Token? ARL's 21,000,000 Cap** · `fixed supply token`              | "No mint, no burn, no pause, no upgrade: what that means"       | "Reading the ARL token contract line by line"              | /core/token, /docs/token-design · "Read the contract"    |
| 4 (9 Nov)    | **How to Pay for AI with Crypto on Base** · `how to pay for AI with crypto`                | "x402 in one thread: sign a ceiling, pay only what you use"     | "Usage-based payments are the missing AI primitive"        | /docs/payments · "Try it on the testnet app"             |
| 5 (16 Nov)   | **x402 upto Scheme: Usage-Based Payments with Permit2** · `x402 upto scheme`               | "Permit2 spending limits for AI agents"                         | "Metering AI work onchain without trusting a server"       | /docs/payments · "Read the docs"                         |
| 6 (23 Nov)   | **ERC-8004 and ERC-8183: Registries and Job Escrow for AI Services** · `ERC-8004 registry` | "How an AI job is hired, escrowed and rated onchain"            | "Reputation for AI services that no one can edit"          | /core/technology · "Register a service"                  |
| 7 (30 Nov)   | **How a 48-Hour Treasury Timelock Protects Token Holders** · `token timelock`              | "2-of-3 Safe + 48 h timelock: the full path of a treasury move" | "Custody design for a one-person project"                  | /docs/token-design · "See the timelock on Basescan"      |
| 8 (7 Dec)    | **Paying for GPU Compute by the Second with ARL** · `pay for GPU compute with crypto`      | "Per-second compute billing in 6 posts"                         | "Compute providers on Base: a reference node"              | /docs/compute-provider (repo) · "Run the reference node" |
| 9 (14 Dec)   | **Anonymous Onchain Polls with Semaphore and Noir** · `Semaphore anonymous signals`        | "Vote without revealing your wallet: how ZK signals work"       | "Privacy as a feature of payments infrastructure"          | /docs/zk-privacy · "Cast an anonymous signal"            |
| 10 (21 Dec)  | **Render, Akash and ARL: Different Answers to AI Compute** · `Render token alternative`    | "Compute tokens compared: supply, payment model, chain"         | "Why ARL settles on Base instead of its own chain"         | /docs/chain-evaluation · "Read the chain evaluation"     |
| 11 (28 Dec)  | **How to Verify a Token Contract on Base Before You Buy** · `verify token contract Base`   | "Basescan, Blockscout, Sourcify: 3 ways to check source"        | "Reproducible bytecode: proving a deploy matches the code" | /buy, /docs/deployment · "Check the ARL address"         |
| 12 (4 Jan)   | **ARL Protocol in 2027: Services Roadmap on Base** · `ARL Protocol roadmap`                | "What shipped in Q4 2026, in 10 posts"                          | "Quarter one on mainnet: numbers and lessons"              | /core/roadmap · "Follow @arlprotocol"                    |

**150-word summaries**

1. _ARL Protocol Launches on Base on 23 October: What to Know._ ARL Protocol moves from the Base Sepolia testnet to Base Mainnet on 23 October 2026. This post lists what changes on launch day and what stays fixed. The token has a fixed supply of 21,000,000 ARL, minted once into 11 allocations; the contract has no owner, mint, burn, pause or upgrade path. Trading opens in the official ARL/USDC, ARL/USDT, ARL/ETH and ARL/BTC pools on Uniswap on Base from 0.20 USD per ARL. There is no airdrop at launch; an airdrop of 500,000 ARL is planned for a later date and will be announced only on arlcoin.io, X @arlprotocol and Telegram. The post explains how to find the official contract address, why any earlier "ARL" on a main network is not official, and how the treasury is protected by a 2-of-3 Safe and a 48-hour timelock. It ends with a short safety checklist for launch-day buyers.
2. _How to Buy ARL on Uniswap on Base, Safely._ A step-by-step guide for first-time buyers. It starts with bridging or buying ETH on Base, then shows how to open Uniswap on Base, paste the official ARL address from arlcoin.io/buy, and compare it character by character with the address on Basescan. It explains the four official pools, the 1% fee tier, why the pools start with ARL only from a 0.20 USD floor, and what slippage settings mean when liquidity is new. It covers adding ARL to MetaMask, reading a swap preview, and recognising fake tokens with the same name. Safety rules close the post: ARL never asks for a seed phrase, a private key or a payment to a personal address, and no one from the project sends direct messages first. Readers are pointed to the FAQ and the Telegram community for questions.
3. _What Is a Fixed Supply Token? ARL's 21,000,000 Cap._ Many tokens can be minted, paused or upgraded by an admin key. This post explains what "fixed supply" means in code: the whole supply is created in the constructor, there is no mint function, no owner role and no proxy, so no one can add tokens later. Using ARL as the example, it walks through the 11 allocations, the vesting wallets with a 12-month cliff and 36 months linear release, and the circulating supply at TGE. It contrasts fixed supply with inflationary staking models and explains why ARL staking rewards come from existing allocations, never from new issuance. Each claim links to the contract and its tests in the public repository, so readers can check it themselves. The post closes with how to read total supply directly from Basescan.
4. _How to Pay for AI with Crypto on Base._ Paying for AI per request is hard with cards and subscriptions. This guide shows a crypto-native alternative on Base. The user signs a spending ceiling once (x402 "upto" scheme with Permit2); the AI service meters the work; a facilitator settles only the ARL actually used, never above the ceiling; and the transfer is recorded on Base for anyone to verify. The post explains each role in plain language, shows where the user stays in control (the ceiling and its expiry), and compares the model with prepaid credits and stablecoin invoices. It links to the payments document and the testnet app where readers can run a simulated request with testnet ARL. It ends with the open questions the protocol still has to answer before services go live.
5. _x402 upto Scheme: Usage-Based Payments with Permit2._ A technical deep dive for developers. It explains the x402 HTTP payment flow, the difference between the "exact" and "upto" schemes, and why usage-based AI work needs an upper bound rather than a fixed price. It walks through the Permit2 signature fields, the facilitator's verification and settlement steps, replay protection, and expiry. Code snippets come from the open-source `@arl/payments` package and its fork tests on Base Sepolia. The post documents failure cases: a service that reports more usage than the ceiling, an expired authorization, and a revoked allowance. It closes with how a provider integrates the package and where to report issues on GitHub.
6. _ERC-8004 and ERC-8183: Registries and Job Escrow for AI Services._ AI services need discovery, payment and reputation that no single company controls. This post explains how ARL uses the ERC-8004 identity and reputation registries to list services and record ratings, and the ERC-8183 job escrow to hold payment until work is delivered. It follows one job end to end: a client hires a service, funds the escrow in ARL, the provider delivers, the evaluator completes or rejects, and funds are released or refunded. It explains what is onchain and what is not, how ratings are tied to completed jobs, and what is deployed on Base Sepolia today. Links lead to the contract source, the tests and the testnet app.
7. _How a 48-Hour Treasury Timelock Protects Token Holders._ A treasury that can move instantly is a risk for every holder. This post explains the ARL treasury design: a timelock holds the tokens, a 2-of-3 Safe can only propose and execute after a minimum 48-hour delay, and a separate guardian can only cancel. It shows how anyone can watch pending operations on Basescan during the delay, why the guardian cannot move funds, and what happens if a signer key is lost. It compares the design with common single-signer treasuries. Every rule links to the contract and its unit tests. The post ends with a short guide to reading a timelock queue as a holder.
8. _Paying for GPU Compute by the Second with ARL._ Compute is billed by the hour on most clouds, even for short jobs. This post introduces per-second compute payments: a provider runs a job, meters seconds used, and settles in ARL over x402 "upto" without ever exceeding the user's ceiling. It describes the open-source reference provider node, how it measures real process time, and how a payment stream can be stopped by either side. It is clear about status: the software is reference code tested on Base Sepolia; no provider runs it in production yet. It invites GPU and CPU operators to try the node and report results on GitHub.
9. _Anonymous Onchain Polls with Semaphore and Noir._ Voting onchain usually reveals every wallet's choice. This post explains how ARL's anonymous signals let members of a group vote without revealing who they are, using a Semaphore-style circuit written in Noir and verified onchain with an UltraHonk verifier. It covers identity commitments, group membership proofs, nullifiers that prevent double voting, and what the contract can and cannot learn. It shows the user flow in the testnet app and links to the circuit, the verifier and the tests with real proofs. It closes with limitations and planned uses such as private feedback on AI services.
10. _Render, Akash and ARL: Different Answers to AI Compute._ A neutral comparison for readers researching AI and compute tokens. It describes each project's model: GPU rendering marketplace, decentralized cloud leases, and ARL's usage-based payments on Base. It compares supply design, how payments work, which chain each uses, and what is live today, using only public sources with links. ARL is presented as a payment layer rather than a compute network; the post explains why it settles on Base instead of running its own chain. No price predictions or rankings are made. It ends with questions readers should ask any compute token before using it.
11. _How to Verify a Token Contract on Base Before You Buy._ Fake tokens copy names and logos. This guide teaches readers to verify any Base token in minutes: find the official address from the project's own site, check it on Basescan, read the verified source, confirm total supply and owner functions, and cross-check on Blockscout and Sourcify. It then shows ARL's extra step: reproducible bytecode, where anyone can rebuild the contracts and compare the result with what is deployed. Screenshots walk through each screen. The post ends with red flags: unverified source, an owner that can mint, hidden fees and proxy upgrades.
12. _ARL Protocol in 2027: Services Roadmap on Base._ A look back at the first weeks on Base Mainnet and the plan ahead. It reports what shipped since 23 October 2026 with links to transactions and releases: pools, holders, contracts, and app usage. It then lists the next milestones: AI services paid per use in ARL, compute providers, staking funded from existing allocations, and the later airdrop with its rules. Each item is marked planned, in development or complete, following the project's content standard. The post invites builders to the GitHub repository and the Telegram community.

### Next step

Draft the week-1 blog post today and have it ready to publish on Mirror on 22 October.

---

## 5. Backlink strategy (zero budget)

| Channel             | Concrete steps                                                                                                                                                                                                                                                                                     | Note                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Crypto directories  | After the mainnet address is verified: the free CoinGecko and CoinMarketCap listing forms (Uniswap pool address, Basescan verification, official channels), the DexScreener token profile, GeckoTerminal, the Base ecosystem page (base.org/ecosystem, by GitHub PR), DefiLlama (if there is TVL). | Only team@arlcoin.io and the official channels in forms. |
| Token lists         | Uniswap's default list is not available; publish the list built by the `tokenlist` package on GitHub and open PRs to the Coinbase Wallet / Trust Wallet assets repositories.                                                                                                                       | Logo `assets/brand/png/arl-token-icon-256.png`.          |
| Bitcointalk         | An "[ANN] ARL Protocol" thread: summary, tokenomics table, contract address, official channels. Weekly updates.                                                                                                                                                                                    | No signature campaign (no budget, risk).                 |
| Reddit              | r/BaseChain, r/ethdev (technical posts), r/CryptoCurrency only inside the "daily discussion" within its rules. Self-promotion ≤ 10%.                                                                                                                                                               | Tutorials instead of links.                              |
| GitHub, open source | arlcoin.io link in the README; PRs to the `awesome-base`, `awesome-x402` and `awesome-erc8004` lists; `@arl/payments` and the circuit as examples in the x402 and Noir communities.                                                                                                                | The most lasting dofollow source.                        |
| Guest posts         | Dev.to, Hashnode, Medium (canonical arlcoin.io or Mirror), Base builder blogs, Paragraph.                                                                                                                                                                                                          | 1–2 contextual links per post.                           |
| Free PR             | Launch release: EIN Presswire free tier, PR.com, OpenPR, PRLog; crypto: CoinCodex and CryptoSlate "submit news".                                                                                                                                                                                   | No price promises.                                       |
| Social bookmarking  | Hacker News "Show HN" (technical angle: x402 upto), Product Hunt (the app), Lobsters (by invitation), Mix.                                                                                                                                                                                         | One week after the launch.                               |
| Forums              | Base Discord builders channel, Farcaster /base and /dev channels, Ethereum Magicians (ERC-8004/8183 implementation report).                                                                                                                                                                        | Focused on technical feedback.                           |

**Sample pitch (guest post)**

```text
Subject: Guest post idea: usage-based AI payments with x402 on Base

Hi <name>,

I build ARL Protocol, an open-source token and payment layer on Base for AI and compute
services. I'd like to write a practical, code-first guide for your readers: "Paying for AI per
request with x402 upto and Permit2", with working snippets from our Apache-2.0 repo
(github.com/armanalabsai/arlcoin.io) and tests on Base Sepolia.

No price talk, no token promotion — a tutorial that works with any ERC-20. One link back to
arlcoin.io in the author bio is all I ask.

Draft in 5 days if this fits. Thanks!
ARL Protocol · team@arlcoin.io · x.com/arlprotocol
```

**Sample pitch (directory or listing)**

```text
ARL Protocol (ARL) — ERC-20 on Base (chain 8453)
Contract: <mainnet address, from arlcoin.io/buy>
Supply: 21,000,000 fixed; no mint, burn, pause or upgrade
Pools: Uniswap v3 on Base, ARL/USDC, ARL/USDT, ARL/WETH, ARL/cbBTC
Source: verified on Basescan; github.com/armanalabsai/arlcoin.io
Channels: arlcoin.io · x.com/arlprotocol · t.me/arlcoin_community · team@arlcoin.io
```

### Next step

Open a PR today for `@arl/payments` on the `awesome-x402` list (or a similar list) on GitHub.

---

## 6. Social SEO

| Platform       | Name / bio                                                                                                                                                                                            | Bio link           | Pinned                                                                                 | Tags                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| X @arlprotocol | "ARL Protocol" · "Utility token for AI & compute payments on @base. 21M fixed supply, no mint. Mainnet Oct 23. Testnet live."                                                                         | https://arlcoin.io | Launch facts + official address check + "No airdrop at launch" (`social/x/profile.md`) | #Base #BaseChain #AI #x402 #DePIN (at most 2 per post) |
| Farcaster      | Username `arlprotocol`, same bio                                                                                                                                                                      | arlcoin.io         | The same launch cast; /base and /dev channels                                          | Channel choice replaces hashtags                       |
| Mirror.xyz     | Publication "ARL Protocol", with ENS or a wallet; description with the keyword                                                                                                                        | arlcoin.io         | A weekly article; a canonical link in each article                                     | Target keyword in the title                            |
| GitHub         | Repository description: "ARL Protocol — fixed-supply ERC-20 and AI/compute payment layer on Base"; website field arlcoin.io; topics: `base`, `erc20`, `x402`, `erc-8004`, `zk`, `solidity`, `foundry` | arlcoin.io         | Badges + official channels at the top of the README                                    | Topics are GitHub's internal SEO                       |
| Telegram       | Group name "ARL Protocol Community", arlcoin.io and X in the description                                                                                                                              | arlcoin.io         | `social/telegram/pinned-messages.md`                                                   | —                                                      |

Rules: the same name ("ARL Protocol"), the same logo and the same bio link on every profile (NAP
consistency, matching the Organization `sameAs`). In posts the link goes at the end, not the
start; the keyword goes in the first line ("ARL on Base", "x402 payments").

### Next step

Enter the description, website and topics in the GitHub repository's "About" field (2 minutes).

---

## 7. Measurement and KPIs

**Setup**

1. Google Search Console: the property is already verified (meta tag). Submit the sitemap
   `https://arlcoin.io/sitemap.xml`. Also add the DNS TXT record for a domain property.
2. Google Analytics 4 (free): analytics.google.com → create a property → web data stream
   `https://arlcoin.io` → measurement ID `G-XXXX`. The site uses cookieless Vercel Analytics
   today; adding GA4 means updating the privacy notice (`/privacy`) and the CSP (`script-src`,
   `connect-src` for `googletagmanager.com` and `google-analytics.com`) together, and it needs
   cookie consent. Recommended for zero budget and privacy: Search Console + Vercel Analytics.
3. Bing Webmaster Tools: import from Search Console; the IndexNow key is already published.
4. Conversion events: whitelist form submission, /buy → Uniswap click, Telegram click.

**KPIs**

| Metric                              | Source                 | 30-day target    | 90-day target |
| ----------------------------------- | ---------------------- | ---------------- | ------------- |
| Organic clicks                      | Search Console         | 500              | 3,000         |
| Impressions                         | Search Console         | 10,000           | 60,000        |
| Average CTR                         | Search Console         | ≥ 4%             | ≥ 5%          |
| Average position for brand queries  | Search Console         | ≤ 3              | 1             |
| Indexed pages                       | Search Console "Pages" | ≥ 90% of sitemap | 100%          |
| Referring domains                   | Search Console "Links" | 15               | 50            |
| Whitelist sign-ups / Telegram joins | Form + Telegram        | tracked          | tracked       |
| Core Web Vitals (mobile)            | PageSpeed / CrUX       | All "Good"       | All "Good"    |

**Weekly report template**

```text
Week: ____  (Mon–Sun)
Organic clicks: ___ (previous week ___, Δ ___%)
Impressions: ___  CTR: ___%  Avg. position: ___
Top 5 queries: 1) ___ 2) ___ 3) ___ 4) ___ 5) ___
Newly indexed / failing pages: ___ / ___
Published: blog ___ · thread ___ · Mirror ___
Backlinks gained: ___ (sources: ___)
Conversions: whitelist ___ · /buy→Uniswap ___ · Telegram ___
Single priority next week: ___
```

**Monthly report template**

```text
Month: ____
Summary (3 points): ___
KPI table: target / actual / difference
Keyword movement: entered the top 10 ___, dropped ___
Content performance: 3 most-clicked pages ___
Technical: CWV status ___, crawl errors ___
Backlinks: new ___, lost ___
Next month: 3 actions ___
```

### Next step

Search Console → Sitemaps → submit `sitemap.xml`.

---

## 8. Weekly SEO routine (7 steps, about 3 hours)

| #   | Step                                                                           | Time   | Free tool                                    |
| --- | ------------------------------------------------------------------------------ | ------ | -------------------------------------------- |
| 1   | Search Console: clicks, impressions, CTR, new queries; fill in the report      | 20 min | Google Search Console                        |
| 2   | Index and error check: "Pages", 404s, redirects                                | 15 min | Search Console, Screaming Frog               |
| 3   | Improve one page's title and description based on CTR                          | 20 min | Search Console + repo (`seo.test.ts` limits) |
| 4   | Publish the week's blog and Mirror post, add internal links                    | 60 min | Mirror.xyz, repo                             |
| 5   | Publish the X and Farcaster thread, check the profile links                    | 20 min | X, Warpcast                                  |
| 6   | 2 backlink attempts (directory, PR, forum, awesome list)                       | 30 min | Email, GitHub                                |
| 7   | Speed and IndexNow: mobile PSI test, `node scripts/indexnow.mjs` after deploys | 15 min | PageSpeed Insights, IndexNow                 |

### Next step

Add a 3-hour "SEO routine" block to the calendar every Monday at 09:00.

---

## 9. Action plan until the 23 October 2026 mainnet launch

| Priority | Task                                                                                                                                                                           | Deadline                  | Done when                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------- |
| 1        | Review and publish the site changes on this branch (meta, JSON-LD, sitemap, robots, manifest, official channels, airdrop and date texts); submit the sitemap to Search Console | 18 October                | Organization + FAQPage pass the Rich Results Test; sitemap "Success" |
| 2        | Update the X @arlprotocol, Telegram, GitHub and Farcaster profiles with the same name, bio and link; pinned posts                                                              | 19 October                | 4 profiles with the same NAP; pinned post live                       |
| 3        | Week-1 blog and Mirror post ("Launches on Base on 23 October") and the launch thread draft                                                                                     | 21 October                | Mirror draft and thread draft approved                               |
| 4        | Launch day: after the mainnet address is verified, build /buy and the token list with `SITE.mainnet.token`; IndexNow; Search Console "Request indexing" (/, /buy, /faq)        | 23 October                | /buy shows the real address; 3 URLs in the indexing queue            |
| 5        | Directory applications: DexScreener profile, GeckoTerminal, CoinGecko and CoinMarketCap forms, Bitcointalk [ANN]                                                               | 25 October (launch + 2 d) | Application emails sent                                              |

### Next step

Priority 1: review this branch and approve the merge (merge and deploy happen separately, with the
owner's approval).
