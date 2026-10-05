# Web Experience Specification V1

Status: **approved by the CTO on 2026-09-27.** This document defines what the ARL website shows,
where every value comes from, and what the site must never do. It is a product specification, not
an implementation. [`website.md`](website.md) describes how the current site is built; this
document describes what it must become. When the two disagree, this document wins and
`website.md` is updated when the change is implemented.

Status labels follow [`content-standard.md`](content-standard.md): `PLANNED`, `IN DEVELOPMENT`,
`LIVE`. This document also uses `BLOCKED` (cannot start until a named dependency exists) and
`NOT IMPLEMENTED` (does not exist in the repository).

## 1. Purpose

The website is the public, verifiable face of ARL. It lets anyone understand what ARL is, how the
token and its controls are built, and check each claim against its source, without trusting the
project.

> Don't ask users to trust ARL. Let them verify ARL.

### Deployment status (read this first)

Two different things are called "deployment". They must never be confused on the site or in
documentation.

| Deployment           | Status           | Evidence                                                                                                                                                                                                          |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website              | `LIVE`           | Vercel serves `arlcoin.io` from `main`; a static mirror runs on GitHub Pages (`.github/workflows/pages.yml`) as a fallback. See [website.md](website.md)                                                          |
| Blockchain contracts | **Not deployed** | No ARL contract exists on any network, test or production. Approved networks: Base Sepolia (testnet, not yet deployed) and Base Mainnet (locked). Only local Anvil rehearsals exist (`scripts/rehearse-local.sh`) |

A live website is not a live token. Every on-chain value on the site stays `UNAVAILABLE` until a
contract deployment exists and its addresses are published through the deployment manifest
(section 15).

## 2. Product Experience Principles

1. **Verify, don't persuade.** Every factual statement links to its source: a repository file, a
   contract constant, a test, a CI run or, after deployment, an on-chain read and an explorer
   page.
2. **Real data only.** No estimated value, no placeholder number, no `0` standing in for missing
   data, no simulated activity. Missing data is shown as `UNAVAILABLE`.
3. **Status is always visible.** Anything not deployed or not built carries its status label.
   Nothing planned is presented as existing.
4. **Infrastructure, not marketing.** The site should read as a technology environment: strong
   typography, a disciplined grid, real system relationships, controlled motion and technical
   precision. It must not look like a crypto template, an AI-generated landing page, a marketing
   dashboard or a hype page.
5. **No pressure.** No urgency, countdowns, scarcity messaging, FOMO, return promises, "buy"
   buttons or price-first layouts.
6. **Read-only by default.** The public site and the Network Console never ask for a wallet and
   never send a transaction.
7. **Reuse before building.** Extend the existing Interactive Core, content registry and design
   tokens. Add a dependency only when a documented need exists.

## 3. Public Experience

The public experience is open to everyone and needs no wallet or account. It has five areas:

| Area         | Purpose                                                                           | Status today                                                        |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Network      | What ARL is: technology, ecosystem, roadmap, team                                 | Exists as the Technology, Ecosystem, Roadmap and Team layers        |
| ARL          | The token: supply, allocation, vesting                                            | Exists as the Token layer                                           |
| Security     | Fixed supply, treasury controls, guardian, Safe model, verification, audit status | Exists as the Security layer; guardian and founder Safe are missing |
| Developers   | Repository, contract sources, deployment and verification process, documentation  | `NOT IMPLEMENTED` as an area; links exist on individual cards       |
| Transparency | Direct answers to the questions in section 5, each with its source                | `NOT IMPLEMENTED`                                                   |

### Homepage: "Enter the Network"

The homepage keeps the Interactive Core as the entry point. In the first seconds it shows
identity and verifiable facts, not marketing copy:

- network identity (the Core);
- `21,000,000 ARL`, fixed; no mint after deployment;
- treasury control: Safe 3-of-5, 48-hour timelock, cancel-only guardian;
- contract status: `Not deployed`;
- source: link to the repository.

Price, trading and market information are not part of the homepage and do not exist today.

## 4. Information Architecture

```
PUBLIC
├── Network
│   ├── Overview
│   ├── Technology            (architecture and infrastructure plans; PLANNED components marked)
│   ├── Ecosystem
│   ├── Roadmap
│   └── Team
├── ARL
│   ├── Token
│   ├── Allocation            (includes the tokenomics table; no separate Tokenomics page)
│   ├── Vesting
│   └── Supply
├── Security
│   ├── Security Architecture
│   ├── Treasury & Roles      (Treasury Safe → Timelock → Execution; Guardian Safe → Cancel)
│   ├── Safe Model
│   ├── Verification
│   └── Audits                (status: none performed)
├── Governance                (Planned / Not Currently Implemented)
├── Developers
│   ├── Repository
│   ├── Contracts             (sources and ABI; addresses after deployment)
│   ├── Deployment & Verification
│   └── Documentation
└── Transparency

TECHNOLOGY ROOM               (system relationship view; section 6)

NETWORK CONSOLE               (BLOCKED — NO DEPLOYMENT; section 7)
├── Contracts
├── Verification
├── Vesting
├── Treasury / Timelock Queue
├── Roles
└── Supply & Distribution

ADMIN / OPERATIONS            (not on the website; section 8)
```

Changes from the originally proposed structure, and why:

- **Governance** is kept as a concept but marked `Planned / Not Currently Implemented`. There is no
  governance contract, no voting and no proposal system. It contains no proposal list, no voting
  and no wallet flow. The authority that exists today is documented under Security → Treasury &
  Roles:
  - Treasury Safe → Timelock → Execution;
  - Guardian Safe → Cancel.
- **Tokenomics** is merged into Allocation. A separate page would repeat the same table.
- **Architecture and Infrastructure** sit inside Network → Technology. ARL has no separate network
  infrastructure yet; the planned components are already described there as `PLANNED`.
- **Market, Wallet and Network Status** are not top-level utilities: nothing is listed, no wallet
  flow exists, and there is no network to report on. Explorer links appear only after deployment.
- **Transparency** is added as its own area because it answers the questions people actually ask.

## 5. Transparency Layer

Each question gets one answer card. Every card follows the same chain:

```
SOURCE        the repository file and commit (or, after deployment, the contract address)
  → DATA      the value, read from packages/tokenomics or a contract constant (after deployment:
              an on-chain read)
  → VERIFICATION
              the test, CI run, verifier check, or explorer page that proves it
```

| Question                              | Answer today (source)                                                                                                                                                                                                                                                                                             | After deployment                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Who holds the tokens?                 | Planned holders per allocation (`packages/tokenomics`, `ARLAllocation.sol`); the deployment plan assigns every allocation to a named contract or Safe                                                                                                                                                             | `balanceOf` for every planned holder                   |
| When do tokens unlock?                | Investors and Strategic Partnerships vest through `ARLVestingWallet`s: 12-month cliff, then 36 months linear; the start date is **TBD** and no public deployment is possible until it is confirmed. Founder: all 2,100,000 ARL unrestricted at TGE (no vesting). Team grants: schedule TBD (`docs/tokenomics.md`) | `ARLVestingWallet` start, cliff, end, released, vested |
| How is the team allocation protected? | Unassigned tokens sit in a dedicated team pool Safe. Grants are irrevocable, made in tranches, each an `ARLVestingWallet` whose beneficiary is the member's own Safe or smart account                                                                                                                             | Each grant's wallet and schedule                       |
| Can more tokens be minted?            | No. The full supply is minted once in the constructor; no mint function exists; a CI check fails if the token interface changes (`ARLToken.sol`, `scripts/check-token-abi.mjs`)                                                                                                                                   | `totalSupply` = 21,000,000; verified source            |
| Who controls the treasury?            | Treasury Safe (3-of-5) is the only proposer and executor on `ARLTimelock`; the timelock is its own admin                                                                                                                                                                                                          | Role checks on the deployed timelock                   |
| How does the timelock work?           | Every operation waits at least 48 hours; the delay cannot be lowered below 48 hours (`ARLTimelock.sol`)                                                                                                                                                                                                           | `getMinDelay`; the operation queue                     |
| What can the guardian do?             | Only cancel pending operations. It cannot propose, execute, move funds or change roles (`ARLTimelock.sol`, `ARLVerify.sol`)                                                                                                                                                                                       | Guardian role check; cancelled operations              |
| What is the Safe structure?           | Treasury Safe 3-of-5; separate guardian Safe; dedicated founder Safe. Signers and thresholds are Safe configuration, not stored in the repository                                                                                                                                                                 | Safe addresses; code present at each                   |
| How is circulating supply calculated? | Total supply minus the balances of protocol-controlled or locked addresses, which are published in the deployment manifest (economic specification section 5). At TGE it is the Founder's unlocked 2,100,000 ARL                                                                                                  | Published methodology + on-chain reads                 |
| Is the contract really verified?      | No contract is deployed. Pre-deployment evidence: unit, fuzz and invariant tests, Slither, and a deployment rehearsal in CI. **No external audit has been performed**                                                                                                                                             | Explorer source verification + `VerifyARL` result      |

## 6. Technology Room

The Technology Room makes ARL feel like a technology environment by showing how the system is
actually built, not through decorative animation. It shows only relationships that exist in the
contracts and deployment scripts:

```
ARLToken ──one-time initial mint (constructor, 21,000,000 ARL)──▶ 11 genesis holders
                                                                   (11 allocations)
                                                                   no mint afterwards

Founder                ──minted directly (2,100,000 ARL, no vesting)──▶ dedicated Founder Safe
Investors              ───▶ ARLVestingWallet (12 + 36 months, start TBD) ───▶ dedicated Safe
Strategic Partnerships ───▶ ARLVestingWallet (12 + 36 months, start TBD) ───▶ dedicated Safe
Treasury allocation    ───▶ ARLTimelock (≥ 48 h, admin = itself)

Treasury Safe (3-of-5) ──schedule / execute──▶ ARLTimelock ──after the delay──▶ execution
Guardian Safe          ──cancel only─────────▶ ARLTimelock

Six other allocations ──minted directly──▶ their own dedicated Safes
Team pool Safe ──funds per-member tranches──▶ ARLVestingWallet ──▶ member's Safe or smart account
```

Rules:

- The diagram is derived from `ARLDeployer.sol` and the contracts, and is updated with them.
- Each node links to its source file and, after deployment, to its address and explorer page.
- Before deployment, every node carries `Not deployed`. Nothing is shown as live.
- Planned components (AI and compute services, staking) appear only in Network → Technology and
  are labelled `PLANNED`. They are not drawn as part of the deployed system.
- Vesting schedules are drawn as `TBD` until they are approved.
- Motion is limited to highlighting a path on hover or focus. No particles, no pulsing and no
  moving "data flow" effects.

## 7. Network Console

**Status: BLOCKED — NO DEPLOYMENT.** No Console screen is built before a contract deployment
exists. This section defines the Console; it does not authorize implementation.

Purpose: let anyone check the deployed system's state against its published design without
connecting a wallet. It answers: which addresses are official, is the code verified, what has
vested and when is the next unlock, what is pending in the treasury timelock, who holds which
role, and where the supply sits.

Rules for every Console screen:

- read-only; no wallet; no write transaction;
- data is fetched **server-side** only; the browser never calls an RPC endpoint;
- values come from the deployed contracts or the explorer, never from estimates;
- if a value cannot be fetched, the screen shows `UNAVAILABLE` with the reason and the source it
  tried;
- never show an estimated value, a `0` in place of missing data, fake live data, fake activity, a
  fake holder count or fake volume.

First version, in this order:

| Screen                    | Purpose                                                                                                   | Data source                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Contracts                 | Official addresses, ABI, source links                                                                     | Deployment manifest (section 15) + explorer                                                          |
| Verification              | Is each contract's source verified; did the post-deployment verifier pass                                 | Explorer verification API + recorded `VerifyARL` result                                              |
| Vesting                   | Investors, strategic partnership and team grant wallets: start, cliff, end, vested, released, next unlock | `ARLVestingWallet` view functions                                                                    |
| Treasury / Timelock Queue | Pending, ready, executed and cancelled operations; earliest execution time                                | `ARLTimelock` events (`CallScheduled`, `CallExecuted`, `Cancelled`) + `getMinDelay`, `getTimestamp`  |
| Roles                     | Proposer, executor, canceller and admin holders                                                           | `hasRole` for the known addresses from the manifest                                                  |
| Supply & Distribution     | Total supply and the balance of every planned holder                                                      | `totalSupply`, `balanceOf` for every manifest holder; circulating supply per the deployment manifest |

`AccessControl` has no role enumeration, so the Roles screen checks the known addresses from the
manifest. It must say that it checks known addresses; it cannot prove that no other holder exists.

## 8. Admin / Operations Boundary

There is **no admin panel on the website**, now or in the first Console version.

| Operation              | Where it happens                                                                           | Exists today                      |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- |
| Deployment             | Foundry: `DeployARL` (validate, deploy, verify)                                            | Yes, rehearsed locally            |
| Verification           | Foundry: `VerifyARL`; explorer source verification                                         | Verifier yes; explorer no         |
| Treasury operations    | Treasury Safe → `ARLTimelock` (schedule, wait ≥ 48 h, execute), through the Safe interface | Contracts yes; not deployed       |
| Emergency cancellation | Guardian Safe → `cancel` on the timelock, through the Safe interface                       | Contracts yes; not deployed       |
| Monitoring             | Alerting on `CallScheduled` so the guardian can react within 48 hours                      | `NOT IMPLEMENTED` (open decision) |
| Configuration          | `contracts/deploy/config/*.json` through reviewed pull requests                            | Local config only                 |

Every admin power already lives in the Safes and the timelock. A web admin interface would add an
attack surface and an authentication system without adding any capability.

## 9. Wallet Model

**No wallet integration exists, and none is planned for the first versions.** The current contracts
expose no user-facing write action that needs the website.

| Action            | Wallet needed                | Exists in ARL today                                                                                                                |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Read              | No                           | Yes: every public and Console screen                                                                                               |
| Address lookup    | No; paste an address         | Possible after deployment; no wallet connection required                                                                           |
| Governance action | Yes                          | **No.** No governance contract                                                                                                     |
| Claim             | Yes                          | **No.** No claim contract. `VestingWallet.release()` is callable by anyone, but beneficiaries are Safes and use the Safe interface |
| Transaction       | Yes                          | Standard ERC-20 transfers need no ARL website                                                                                      |
| Admin             | Safe signers + timelock role | Through the Safe interface only, never through the website                                                                         |

A wallet integration is reconsidered only if a contract with a user-facing write action is
approved and deployed.

## 10. Read vs Write Model

- **Public site:** static content, read-only.
- **Network Console:** server-side reads (`eth_call`, `eth_getLogs`, explorer API), cached,
  read-only.
- **Writes:** none on the website. All writes happen through Safes (treasury, guardian,
  beneficiaries) or standard wallets (ERC-20 transfers), outside the site.
- The site stores no user data, sets no tracking cookies and has no accounts.

## 11. Whitelist Status

**WHITELIST NOT CURRENTLY IMPLEMENTED.**

The repository contains no whitelist, allowlist, Merkle proof, airdrop, presale or claim logic in
contracts, deployment scripts, the website or documentation. The Public Launch allocation's terms
are `undecided` ("Terms set before any launch"). No whitelist UI, architecture or eligibility
check is to be designed until a launch mechanism is approved.

## 12. Data Architecture

| Layer               | Source                                                                                    | Available                            |
| ------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| Tokenomics          | `packages/tokenomics` (the single source of truth); the site imports it at build time     | Now                                  |
| Contract facts      | Contract constants and documented behaviour (`MAX_SUPPLY`, `MIN_DELAY_FLOOR`, role model) | Now                                  |
| Evidence            | Repository files and commits, test names, CI runs                                         | Now                                  |
| Deployment manifest | The `DeployARL` output per network, committed to the repository (section 15)              | After deployment                     |
| On-chain state      | Server-side RPC reads against manifest addresses                                          | After deployment                     |
| Explorer data       | Source verification; optionally holders and transfers                                     | After deployment and chain selection |

The existing content model already enforces the rule: a `Metric` is either `static` or
`unavailable` with a named future source (`chain.contractAddress`, `chain.circulatingSupply` …),
and a unit test prevents guessed values. On-chain data sources are added as new named sources; the
fallback stays `UNAVAILABLE`.

## 13. On-chain Data Strategy

Applies only after deployment.

- **Server-side only.** Reads run in the Next.js server (route handlers or static regeneration).
  No RPC URL or key reaches the browser.
- **Cached.** Values are regenerated on an interval and every value carries its read time. The
  interval is chosen per screen (queue and vesting more often than contract metadata).
- **Addresses come only from the manifest.** No address is typed into page content by hand.
- **One lightweight read library, server-side**, if any (for example viem, MIT). No wallet SDK.
  This is an open decision.
- **Explorer API** for source verification and, optionally, holders and transfers. ARL runs no
  indexer.
- **Failure:** if the RPC or explorer fails, the value is `UNAVAILABLE` and the last successful
  read time is shown if one exists. A stale value is never shown as current.

## 14. Security UX

- No "Connect wallet", "Buy", "Claim" or "Approve" buttons anywhere.
- No request for a signature, seed phrase or private key, ever. The site states this in its
  security section.
- Every external link is explicit about its destination (explorer, GitHub, Safe).
- Security limits are shown next to the claims they qualify: no audit performed, lost keys depend
  on the beneficiary Safe, the Safe threshold is Safe configuration rather than a contract rule.
- Security headers stay as they are (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`), and a Content Security Policy is added.

## 15. Official Address / Phishing Protection

- **One source of official addresses:** a deployment manifest per network, generated by
  `DeployARL`, committed to the repository through a reviewed pull request, and read by the site at
  build or regeneration time. (Today `contracts/deploy/deployments/` is ignored by git; committing
  the manifest is an open decision.)
- The site shows each address in full, EIP-55 checksummed, in the monospace face, with a copy
  control and a link to the explorer.
- The same addresses appear in the repository, on the site and on the explorer. Any mismatch is a
  release blocker.
- The site states plainly that ARL is not deployed until the manifest exists, and that any token
  claiming to be ARL before then is not ARL (as `SECURITY.md` already does).
- No address is shown before deployment, including test addresses.

## 16. Design System

The existing ARL CORE color language (`website.md`, `app/globals.css`) is kept. Additions define
how technical content is presented.

| Element            | Rule                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour             | Near-black page, graphite surfaces, off-white type, ARL amber `#eea53f` only for the Core, active state, focus and primary metrics. No neon, no gradients |
| Theme              | Dark only. A light theme is an open decision                                                                                                              |
| Typography         | Manrope for text, Fraunces for headings, Source Code Pro for numbers, addresses, hashes and identifiers. Numbers use tabular figures          |
| Spacing            | 4px scale                                                                                                                                                 |
| Grid               | 12-column grid on wide screens; single column on phones; long-form pages capped at a readable measure                                                     |
| Radius             | 8px controls, 12px cards, 16px surfaces, circle for the Core                                                                                              |
| Elevation          | Glass weight by importance; lit top edge                                                                                                                  |
| Glass              | Liquid glass for the top bar, cards, the Core and the detail surface, over the nucleus field; solid under reduced transparency                            |
| Iconography        | Minimal line icons for status and link type only; no illustrative or 3D icons                                                                             |
| Motion             | Short, purposeful, spring-based where it explains a transition; `prefers-reduced-motion` turns it into fades                                              |
| Status indicators  | Text labels `PLANNED`, `IN DEVELOPMENT`, `LIVE`, `BLOCKED`, `UNAVAILABLE`, `Not deployed`; never colour alone                                             |
| Tables             | Primary format for allocations, schedules, roles and addresses; right-aligned numbers, monospace identifiers                                              |
| Data visualisation | Only from real data: allocation bar, vesting timeline. No decorative charts, no charts with invented values                                               |
| Technical diagrams | SVG, drawn from the contracts (section 6), labelled, readable without colour                                                                              |
| Buttons            | Navigation and copy actions only; no transaction buttons                                                                                                  |
| Cards              | Existing weighted cards; each card with a status label and a source link                                                                                  |
| Breakpoints        | Existing: grid layout below 1100 × 760, orbit from 1100 × 760 (dense layers from 1360 × 820), sheet detail below 768px                                    |

## 17. User Journey

1. **Arrive** at the Core: identity, the five verifiable facts, contract status.
2. **Choose a question** (Transparency) or an area (Network, ARL, Security, Developers).
3. **Read the answer** and follow SOURCE → DATA → VERIFICATION to the repository, test or CI run.
4. **See the system** in the Technology Room: how token, vesting, Safes, timelock and guardian
   connect.
5. **After deployment, check the live state** in the Network Console: official addresses,
   verification, vesting, timelock queue, roles, supply.

Developers go straight to Developers → Repository, Contracts, and Deployment & Verification.

## 18. Mobile UX

- Every screen works on a phone. The orbit becomes a grid below 1100 × 760; detail surfaces become
  full-height sheets below 768px (existing behaviour).
- Tables become stacked label-value rows on narrow screens; addresses wrap in monospace and keep
  their copy control.
- Diagrams switch to a vertical layout rather than being scaled down.
- No hover-only information: everything shown on hover is also available on tap and focus.
- Parallax stays disabled on touch devices.

## 19. Accessibility

Target: WCAG 2.2 AA.

- Keep the existing guarantees: real links, keyboard navigation, the Radix dialog focus trap, skip
  link, live region, visible focus, `prefers-reduced-motion`.
- Status never relies on colour alone.
- Diagrams have a text equivalent (the relationship list in section 6).
- Numbers and addresses are readable by screen readers; the copy control has an accessible label.
- Contrast is checked for every text colour on every surface.

## 20. SEO

- Every page is statically generated with its own title, description, canonical link and Open
  Graph data (existing).
- Transparency answers and Security pages are real document pages with headings, so search
  engines and readers get full text rather than content hidden in a dialog.
- Structured data stays factual: `WebSite` today. No product, offer, price or rating markup.
- The sitemap lists only real pages and no invented modification dates (existing).
- English only (`content-standard.md`); no i18n.

## 21. Performance

- Static pages by default; Console pages use cached server-side regeneration.
- No client-side chain library and no wallet SDK in the bundle.
- Budgets: each route's first-load JavaScript no larger than today's; LCP under 2.5 s and CLS under
  0.1 on a mid-range phone.
- Fonts stay self-hosted. Images only where they carry information.
- Motion animates transforms and opacity only.

## 22. Error / Loading / Empty States

| State                                       | Shown as                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Not deployed                                | `Not deployed`, with a link to the deployment status                                                   |
| Data source failed                          | `UNAVAILABLE`, the source that was tried, and the last successful read time if there is one            |
| Loading                                     | A fixed-size skeleton with no numbers; never a spinner that ends in a guessed value                    |
| Empty (for example, no timelock operations) | A plain statement ("No operations scheduled") with the read time, clearly different from `UNAVAILABLE` |
| Not decided                                 | `Not defined yet` with the open decision named (for example circulating supply → M-2)                  |
| Unknown route                               | The existing 404 page                                                                                  |

`0` is shown only when a successful read returned zero.

## 23. Required Screens

| Screen                                   | Purpose                                                               | User                  | Data source                | R/W | Wallet | Security consideration                       | Dependency           | Status                                           |
| ---------------------------------------- | --------------------------------------------------------------------- | --------------------- | -------------------------- | --- | ------ | -------------------------------------------- | -------------------- | ------------------------------------------------ |
| Homepage                                 | Identity and five verifiable facts                                    | Everyone              | Repository, tokenomics     | R   | No     | No price or trading content                  | —                    | Exists; facts to add                             |
| Transparency                             | Answers with SOURCE → DATA → VERIFICATION                             | Everyone              | Repository, tests, CI      | R   | No     | Every answer sourced                         | —                    | `NOT IMPLEMENTED`                                |
| Security Architecture / Treasury & Roles | Treasury Safe → Timelock → Execution; Guardian → Cancel; founder Safe | Everyone              | Contracts, docs            | R   | No     | Limits shown next to claims                  | —                    | Exists partly; guardian and founder Safe missing |
| Technology Room                          | Real contract relationships                                           | Everyone, developers  | Contracts, deployer        | R   | No     | Nothing drawn as live before deployment      | —                    | `NOT IMPLEMENTED`                                |
| Allocation and Vesting                   | Amounts and schedules                                                 | Everyone              | `packages/tokenomics`      | R   | No     | —                                            | —                    | Exists                                           |
| Supply                                   | Fixed supply, no mint; circulating status                             | Everyone              | Tokenomics, token contract | R   | No     | Circulating shown as not defined             | M-2 for circulating  | Exists partly                                    |
| Developers                               | Repository, sources, deployment and verification process              | Developers            | Repository                 | R   | No     | —                                            | —                    | `NOT IMPLEMENTED`                                |
| Governance                               | States that governance is planned and not implemented                 | Everyone              | —                          | R   | No     | No voting or proposal UI                     | —                    | `NOT IMPLEMENTED`                                |
| Console: Contracts                       | Official addresses                                                    | Everyone, integrators | Manifest, explorer         | R   | No     | Phishing (section 15)                        | Deployment, manifest | `BLOCKED`                                        |
| Console: Verification                    | Source verification and verifier result                               | Everyone, developers  | Explorer, `VerifyARL`      | R   | No     | —                                            | Deployment, chain    | `BLOCKED`                                        |
| Console: Vesting                         | Vested, released, next unlock                                         | Everyone              | `ARLVestingWallet`         | R   | No     | —                                            | Deployment           | `BLOCKED`                                        |
| Console: Treasury / Timelock Queue       | Pending and past operations                                           | Everyone, guardian    | `ARLTimelock` events       | R   | No     | Supports guardian monitoring                 | Deployment           | `BLOCKED`                                        |
| Console: Roles                           | Role holders for known addresses                                      | Everyone              | `hasRole`                  | R   | No     | States that only known addresses are checked | Deployment           | `BLOCKED`                                        |
| Console: Supply & Distribution           | Total supply and holder balances                                      | Everyone              | `totalSupply`, `balanceOf` | R   | No     | No circulating figure without methodology    | Deployment, M-2      | `BLOCKED`                                        |

## 24. Optional Screens

| Screen                                       | Data source                             | Dependency                          |
| -------------------------------------------- | --------------------------------------- | ----------------------------------- |
| Holders                                      | Explorer API                            | Deployment, chain, explorer support |
| Transfers                                    | Explorer API                            | Deployment, chain, explorer support |
| Network Status                               | RPC health                              | Deployment                          |
| Unlock timeline chart                        | `packages/tokenomics`                   | None (static)                       |
| Address lookup (paste an address, no wallet) | Server-side `balanceOf` / vesting reads | Deployment                          |

## 25. Explicitly NOT NEEDED

- Wallet connection of any kind.
- Admin or operations panel on the website.
- Active governance UI, proposals, voting, or any governance transaction flow.
- Whitelist, allowlist, Merkle, presale, airdrop or claim UI.
- Staking UI (no staking contract).
- Market, price, trading, charts of price or volume.
- Live counters, activity feeds, investor numbers, "users online", or any metric without a real
  source.
- Browser-side RPC.
- i18n (English only).
- A separate documentation framework (repository Markdown is the documentation).

## 26. Implementation Dependencies

| Work                                                                          | Depends on                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Content corrections (guardian, founder Safe, `website.md` deployment wording) | Nothing                                                                    |
| Information architecture, Transparency, Technology Room, Developers           | This specification                                                         |
| Circulating supply answer                                                     | M-2 custody decision and methodology                                       |
| Network Console (all screens)                                                 | Chain selection, testnet deployment, deployment manifest in the repository |
| Console: Verification                                                         | Explorer source verification on the chosen chain                           |
| Guardian monitoring                                                           | Deployment; alerting decision                                              |

## 27. Implementation Order

Each step needs its own approval.

1. **Content corrections, no new components:**
   - add the guardian to the Security layer;
   - add the founder Safe (now on `main` through M-3);
   - correct the deployment wording in `website.md`.
2. **Information architecture** within the existing Interactive Core and content registry:
   Network, ARL, Security, Governance (planned), Developers.
3. **Transparency pages and the Technology Room** (static, sourced from the repository).
4. **Contract-side prerequisites** (outside the website): chain selection, M-2, testnet gate,
   testnet deployment.
5. **Deployment manifest and server-side read-only data layer** with `UNAVAILABLE` fallbacks.
6. **Console screens**, in this order: Contracts → Verification → Vesting → Treasury / Timelock
   Queue → Roles → Supply & Distribution.
7. **Optional screens** (holders, transfers, network status).

A wallet layer is not on this list. It is reconsidered only if a user-facing write contract is
approved.

## 28. Open Decisions

1. Test and production chain (blocks the whole Console).
2. Console location: a path on `arlcoin.io` (recommended) or a separate subdomain.
3. Server-side read library (for example viem) or plain JSON-RPC.
4. Commit the deployment manifest to the repository (recommended; changes the current ignore rule).
5. Circulating supply methodology (depends on M-2).
6. Operational alerting for `CallScheduled` (outside the website).
7. Whether Transparency and Security become standalone document pages or stay inside the single
   Core screen (standalone pages recommended for readability and SEO).
8. Light theme (recommended: no).

## 29. Risks

| Risk                                                     | Mitigation                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Site content lags the contracts (guardian missing today) | Content corrections first; review content with every contract change   |
| Website deployment mistaken for contract deployment      | The two are always labelled separately (section 1)                     |
| Fake or stale data after an RPC or explorer failure      | `UNAVAILABLE` fallback; read time on every value                       |
| Phishing with look-alike addresses                       | One manifest, full checksummed addresses, repository = site = explorer |
| Console built before deployment invites placeholder data | Console stays `BLOCKED` until the manifest exists                      |
| Dense content overwhelms the single-screen Core          | Standalone document pages for long answers (open decision 7)           |
| New dependencies enlarge the supply-chain surface        | Server-side only, one read library at most, no wallet SDK              |

## 30. Acceptance Criteria

A release of the website meets this specification only if all of the following hold:

1. Every factual statement has a source link; every source link resolves.
2. No page shows an estimated, placeholder or invented value; missing data is `UNAVAILABLE`, and
   `0` appears only when a successful read returned zero.
3. Every planned, blocked or undeployed item carries its status label.
4. The site states that no contract is deployed until a deployment manifest exists, and never
   presents the website deployment as a contract deployment.
5. No wallet connection, transaction, claim, whitelist, governance or admin UI exists.
6. Governance is shown as `Planned / Not Currently Implemented`, and the current authority model
   is shown as Treasury Safe → Timelock → Execution and Guardian Safe → Cancel.
7. The Technology Room shows only relationships present in the contracts and deployment scripts.
8. Network Console screens exist only after deployment, read server-side only, and make no browser
   RPC calls.
9. Official addresses come only from the deployment manifest and match the explorer.
10. Accessibility (WCAG 2.2 AA), mobile layouts, SEO metadata and performance budgets in sections
    18–21 are met, and the existing unit and end-to-end tests pass.
