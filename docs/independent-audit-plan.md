# Independent audit without cash (plan; nothing sent)

ARL has **no independent audit**. The owner pays no cash, so a classic paid audit is out. This page
lists the routes checked on 2026-10-05 that need no cash from the project, and the drafts for each.
Nothing here has been sent. Until a report from an independent party is published, every public
text keeps saying "not audited" ([audit-evidence.md](audit-evidence.md)).

## Routes checked

| Route                                              | Cash from ARL                      | What it gives                                 | Status                                                                                        |
| -------------------------------------------------- | ---------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A. Runtime Verification, Base Services Hub         | None                               | Audit-readiness assessment by an outside firm | Draft ready ([release-readiness.md](release-readiness.md#2-application-drafts-not-submitted)) |
| B. Optimism Superchain Audit Grant (Base eligible) | None; the grant pays the auditor   | Full audit by a whitelisted firm              | Season-based; an audit firm applies for us                                                    |
| C. Audit paid in ARL after the TGE                 | None; ARL from Grants / Bug Bounty | Full audit if a firm accepts token payment    | Draft ready (below)                                                                           |
| D. Public review + bug bounty in ARL               | None                               | Ongoing outside review, not an audit          | Approved; needs the public repository                                                         |
| Ethereum Foundation subsidy (Areta)                | Up to 70 % of the price            | Ethereum mainnet only, 30 % subsidy           | Rejected: costs cash                                                                          |
| Arbitrum Audit Program                             | -                                  | Arbitrum projects only                        | Rejected: wrong chain                                                                         |
| Security.xyz, Sherlock, Code4rena, Cantina         | Paid by the project                | -                                             | Rejected: costs cash                                                                          |

Order: send A and B together, C only to firms that answer B, D starts when the repository is
public. A alone is not an audit and is never described as one.

Sources: Optimism audit grants ([atlas.optimism.io/missions/audit-grants](https://atlas.optimism.io/missions/audit-grants),
[Hacken Superchain grants](https://hacken.io/services/superchain-audit-grants/)); EF subsidy
([CoinDesk, 2026-04-14](https://www.coindesk.com/tech/2026/04/14/ethereum-foundation-unveils-usd1m-audit-subsidy-program-to-boost-crypto-security-and-cut-costs-for-builders));
Arbitrum ([arbitrum.foundation/grants](https://arbitrum.foundation/grants)).

## B. Superchain Audit Grant

How it works: an approved Audit Service Provider (ASP) applies to the Optimism Grants Council on the
project's behalf; if approved the grant pays the ASP. Requirements seen: deployed or planned on a
Superchain chain (Base is one), working demo, scope matching the risk. Season 9 closed on
2026-06-03; the next window is not confirmed. Recipients report TVL impact afterwards, which ARL can
only show after the TGE, so approval is uncertain.

Recipients (whitelisted ASPs seen publicly): Hacken, Nethermind. Contact through their website forms.

> Subject: ARL Protocol (Base) - request to apply for the Superchain Audit Grant on our behalf
>
> Hello, we are building ARL Protocol on Base and would like an audit funded through the Optimism
> Superchain Audit Grant, with your team as the Audit Service Provider. We cannot pay for an audit
> ourselves.
>
> Scope: 6 Solidity contracts, 368 nSLOC, solc 0.8.36, OpenZeppelin v5.6.1 unmodified: a fixed-supply
> ERC-20 (21,000,000 ARL, no owner, mint, pause or upgrade), vesting wallets, a TimelockController
> treasury (48-hour floor, cancel-only guardian), a Merkle claim distributor and a staking contract.
> Deployed and source-verified on Base Sepolia (token 0x244312b619127B6458154F3467eFD7c87CD28500);
> mainnet launch on Base targeted for 2026-12-01. No independent audit yet. Existing evidence: 251
> Foundry tests with fuzzing and invariants, Slither 0 results, Halmos symbolic proofs, reproducible
> bytecode, deployment rehearsals.
>
> Could you apply for the grant on our behalf in the next open window, or tell us what is missing?
> Website: https://arlcoin.io - Contact: armanalabsai@gmail.com
>
> Alaz Dağhan Göktürk, ARL Protocol

## C. Audit paid in ARL

Same text as B, with this paragraph instead of the grant request:

> If the grant is not available, would you consider being paid in ARL instead of cash? The payment
> would come from the Grants / Bug Bounty allocation (400,000 ARL, held in a 2-of-3 Safe) after the
> mainnet launch, with the amount and any vesting agreed in writing before work starts.

Limits: an amount must be agreed by the owners and signed from the Grants / Bug Bounty Safe; it
cannot be promised before the TGE exists; it is not a sale and no price is quoted.

## D. Public review

Already approved: the bug bounty paid in ARL ([bug-bounty.md](bug-bounty.md)). It needs the GitLab
group and repository to be public (owner action; see [release-readiness.md](release-readiness.md)).

## What the owner does

1. Approve sending A, B (and C with B).
2. Make `armanalabs-group` and `armanalabs-group/arlcoin` public, so reviewers can read the code.

Only when an independent party publishes a report does the site's audit card change, and then it
names that party and links the report.
