# 2026-10-18 (Sun) · Week recap: security audit done, TGE target in 5 days

Status: DRAFT. Nothing here has been published. Publish by hand. English only.

The calendar draft for this day (`social/calendar/2026-10-11_to_2026-10-23.md`) was written on
2026-10-10. It is replaced by the posts below, which use the facts measured on 2026-10-17
(271 tests, the internal security audit). The rules of the calendar apply: no price, return,
listing, partnership or free-token claim; the TGE is a target.

## Facts used (checked 2026-10-18)

| Claim                                                                                   | Source                                                |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Internal multi-layer security audit, 17 Oct 2026, reviewed commit `ab7595b`             | `security/2026-10-17/report.md`                       |
| 0 critical, no exploitable vulnerability in contract code; 1 H, 4 M, 3 L, 4 I; 0 open   | `security/2026-10-17/findings.md`                     |
| Slither 102 detectors: 0 results; Aderyn: all triaged (false positive or by design)     | `security/2026-10-17/report.md` → Layers              |
| Foundry 271/271 pass; 29 fuzz tests at 10,000 runs; deep campaign 200,000 runs          | `security/2026-10-17/report.md` → Layers              |
| Halmos 11/11 properties proved (bounded); Mythril: no exploitable issue                 | `security/2026-10-17/report.md` → Layers              |
| Base Mainnet fork rehearsal passes with the real signers                                | `CHANGELOG.md` 2026-10-17, `docs/mainnet-runbook.md`  |
| TGE target 2026-10-23 00:00 UTC; Base Mainnet not deployed yet                          | `CHANGELOG.md` 2026-10-17                             |
| 21,000,000 ARL minted once; no mint, owner, proxy, pause or blacklist                   | `contracts/src/ARLToken.sol`, audit "Areas checked"   |
| Telegram bot @Arlprotocol_bot with `/status` and `/launch`                              | `CHANGELOG.md` 2026-10-17                             |
| No airdrop at launch; mainnet addresses only on arlcoin.io after verification           | `social/telegram/pinned-messages.md`                  |

Always say "internal audit". Never "audited by" a third party.

## Visuals

| File                                                     | Size      | Use                     |
| -------------------------------------------------------- | --------- | ----------------------- |
| `x-telegram-1600x900/arl-week-recap-audit.png`           | 1600×900  | X post, Telegram post   |
| `instagram-1080x1350/arl-audit-1.png` … `arl-audit-5.png` | 1080×1350 | Instagram carousel, 1–5 |
| `medium-1400x788/arl-audit-medium-cover.png`             | 1400×788  | Medium cover image      |

Source: `src/cards.html`. Re-render with `bash social/2026-10-18/src/render.sh` after a text change.

### Alt text

- **arl-week-recap-audit.png:** ARL Protocol week recap, 18 Oct 2026. Headline: Audited before
  launch. Internal multi-layer security audit, 17 Oct 2026, evidence public. Four tiles: 0 critical
  findings, 0 open; 271 of 271 Foundry tests pass; 11 of 11 Halmos properties proved; TGE target on
  Base, Oct 23, 00:00 UTC. Footer: Base Mainnet not deployed yet, team never DMs first.
- **arl-audit-1.png:** Audited before launch. Week recap: the security audit is done. 5 days to the
  TGE target.
- **arl-audit-2.png:** 21,000,000 ARL, minted once. Not in the contract: a mint function, an owner,
  an upgrade proxy, a pause button, a blacklist. OpenZeppelin ERC20 and ERC20Permit, unmodified.
- **arl-audit-3.png:** Six audit layers, one public report: Slither 0 results, Aderyn triaged,
  Foundry 271 of 271, Halmos 11 of 11, Mythril no exploit, Base Mainnet fork rehearsal pass.
- **arl-audit-4.png:** 0 critical, 0 open. 12 findings: 1 high, 4 medium, 3 low, 4 informational,
  each fixed, mitigated or accepted with the reason recorded.
- **arl-audit-5.png:** TGE target 23 Oct 2026, 00:00 UTC. Verify before you trust: no airdrop at
  launch, mainnet addresses only on arlcoin.io after verification, the team never DMs first.
- **arl-audit-medium-cover.png:** How we audited ARL before the TGE. Slither, Aderyn, Foundry,
  Halmos, Mythril, Base Mainnet fork rehearsal.

## X (@arlprotocol)

Image: `arl-week-recap-audit.png`. Characters: 262 (links counted as 23).

```text
Week recap:

- Internal security audit done: 0 critical, 0 open findings
- 271/271 Foundry tests, 11/11 Halmos proofs, Slither 0 results
- Mainnet launch rehearsed on a Base fork

TGE target: Oct 23, 00:00 UTC.

Evidence: github.com/armanalabsai/arlcoin.io

#Base #Security
```

Reply to the post (thread, 2/2):

```text
Not deployed on Base Mainnet yet. Addresses go up on arlcoin.io only after the deployment is verified.

No airdrop at launch. The team never DMs first.
```

## Telegram (t.me/arlcoin_community)

Image: `arl-week-recap-audit.png`. Pin until the 2026-10-22 post.

```text
Week recap · 18 Oct 2026

Security audit done
An internal, multi-layer audit of the nine ARL contracts, the deploy scripts and the signed Base Mainnet run was completed on 17 Oct.
• No critical finding, no exploitable vulnerability in contract code
• 12 findings (1 high, 4 medium, 3 low, 4 info), 0 open: each fixed, mitigated or accepted with the reason recorded
• Slither 0 results · Foundry 271/271 · Halmos 11/11 proofs · Mythril no exploitable issue
• Launch day rehearsed on a Base Mainnet fork with the real signers

Report and raw evidence:
https://github.com/armanalabsai/arlcoin.io/tree/main/security/2026-10-17

Next
TGE target: 23 Oct 2026, 00:00 UTC. Ask @Arlprotocol_bot /launch for the plan and /status for live service status.

Stay safe
• Not deployed on Base Mainnet yet. Addresses appear on https://arlcoin.io only after the deployment is verified.
• No airdrop at launch.
• The team never sends the first DM and never asks for a seed phrase.
```

## Instagram

Carousel: `arl-audit-1.png` → `arl-audit-5.png`, in order. Caption:

```text
Audited before launch.

On 17 October we completed an internal, multi-layer security audit of the ARL contracts, the deployment scripts and the signed Base Mainnet launch run.

What we ran:
→ Slither, 102 detectors: 0 results
→ Aderyn: every result triaged
→ Foundry: 271/271 tests, fuzz at 10,000 runs, invariant suites
→ Halmos: 11/11 properties proved (bounded)
→ Mythril: no exploitable issue
→ A full launch-day rehearsal on a Base Mainnet fork

Result: no critical finding and no exploitable vulnerability in contract code. 12 findings on custody, launch procedure and design choices. All closed: fixed, mitigated, or accepted with the reason written down.

The token itself: 21,000,000 ARL, minted once. No mint function, no owner, no proxy.

Where we are, honestly:
• Live on Base Sepolia testnet.
• Base Mainnet TGE targeted for 23 October, 00:00 UTC. Not deployed yet.
• No airdrop at launch. The team never DMs first.

Every report and raw tool output is public on GitHub (link in bio).

Which audit layer would you want to read first? 👇

#blockchain #crypto #web3 #ai #security #smartcontracts #solidity #ethereum #base #basechain #onchain #defi #depin #opensource #buildinpublic #audit #smartcontractaudit #web3security #cybersecurity #foundry #developer #web3developer #layer2 #cryptotech #arlcoin
```

## Medium

Cover: `arl-audit-medium-cover.png`. Tags (max 5): `Blockchain`, `Smart Contracts`, `Security`,
`Base`, `Web3`.

**Title:** How we audited ARL before the TGE

**Subtitle:** Six layers, twelve findings, zero open — and every raw output public.

```markdown
ARL is a payment rail for AI and compute services on Base. Its token is 21,000,000 ARL, minted once in the constructor. Our target for the token generation event (TGE) on Base Mainnet is 23 October 2026, 00:00 UTC.

Before that, we wanted one question answered with evidence rather than adjectives: is there anything in the contracts, the deployment scripts or the launch run that an attacker could use?

On 17 October we completed an internal, multi-layer security audit. This post explains what we ran, what we found and what we did about it. Everything we cite is public in the repository.

## Scope

- The nine ARL contracts, at commit `ab7595b`.
- The deployment scripts.
- The signed Base Mainnet run for launch day: we checked that all four transactions carry the bytecode built from the reviewed commit and that their constructor arguments match the published mainnet plan.

Off-chain services and market risk were out of scope.

## The six layers

**1. Static analysis.** Slither with 102 detectors reported nothing. Aderyn reported 5 issue types in 16 instances; each was triaged as a false positive or a documented design choice, and CI now fails if any result appears outside that baseline.

**2. Tests.** 271 of 271 Foundry tests pass: unit tests, 29 fuzz tests at 10,000 runs each and 5 invariant suites at 32,768 calls each. A longer campaign ran each fuzz test 200,000 times.

**3. Symbolic proofs.** Halmos proved 11 of 11 properties, among them that no call can change the total supply. These proofs are bounded, not full formal verification.

**4. Symbolic execution.** Mythril on the runtime bytecode of the launch contracts found no exploitable issue.

**5. Fork rehearsal.** The whole launch day ran on a Base Mainnet fork with the real signers.

**6. Manual triage.** Every tool result was reviewed by hand and recorded as a finding or as a non-issue, with the reason.

## What we found

No critical finding, and no exploitable vulnerability in contract code.

There were 12 findings: 1 high, 4 medium, 3 low and 4 informational. None is in the token logic. They concern custody, the launch procedure and design choices we had made on purpose. Three examples:

- **High, custody.** The role Safes share the same three owners at a 2-of-3 threshold. Mitigation: separate hardware wallets and devices for each owner, no shared backups, and the largest Safes move to 3-of-5 with independent signers after launch.
- **Medium, launch order.** A trade between the two liquidity batches would make the second one revert. Fixed in the runbook: both signatures are collected first and the batch is executed within seconds.
- **Low, deploy check.** The deploy screen verified creation code but not constructor arguments. Fixed in the runbook: the run file's SHA-256 and every argument are checked before signing.

Every finding is closed: fixed, mitigated, or accepted with the reason recorded.

## What the token does not have

No mint function. No owner. No upgrade proxy. No pause. No blacklist. It is OpenZeppelin ERC20 and ERC20Permit, unmodified. Less code means less to trust.

## Reproduce it

The workflow `security-audit.yml` reruns the checks on every change: Slither must report nothing, every Aderyn result must be in the triaged baseline, every test must pass, every fuzz test must run at least 10,000 times and Halmos must prove every property. Mythril runs weekly.

Report, scope, findings and raw outputs:
https://github.com/armanalabsai/arlcoin.io/tree/main/security/2026-10-17

## Before 23 October

- ARL is live on Base Sepolia testnet. It is not deployed on Base Mainnet yet.
- Mainnet addresses will be published on https://arlcoin.io only after the deployment is verified. Any address posted before that is fake.
- There is no airdrop at launch.
- The team never sends the first direct message.

Questions about the audit are welcome in our community: https://t.me/arlcoin_community

Verify before you trust.
```
