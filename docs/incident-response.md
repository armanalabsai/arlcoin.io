# Incident response

What happens when a security problem is reported or found. ARL contracts have **no pause, no
upgrade and no owner** (by design), so a contract bug cannot be patched in place: the response is
to warn users, stop the parts that are run by people (Safes, validators, the arbiter Safe, the website),
and, if needed, deploy a fixed version and move to it.

## Who acts

The project has one maintainer today (see [branch-protection.md](branch-protection.md)). Reports
go to team@arlcoin.io with "Security" in the subject, as described in [SECURITY.md](../SECURITY.md).
Safe actions need the signers of the Safe concerned (see [mainnet-plan.md](mainnet-plan.md)).

## Detection

The [Uptime](../.github/workflows/uptime.yml) workflow checks every 10 minutes that the website,
the app page and `security.txt` answer, that Base Mainnet produces blocks and that a funded staking
reward period runs for at least 3 more days. A failed check fails the run and GitHub notifies the
owner by email and in the mobile app. The [Monitor mainnet](../.github/workflows/monitor.yml)
workflow checks the recorded Base Mainnet deployment. The [Protocol events](../.github/workflows/events.yml)
workflow (S-4 in [security-hardening.md](protocol/security-hardening.md)) scans the live ARLJobs v3
escrows, the Verified Evaluator v5 contracts and the staking contract every hour (addresses in
[events-8453.json](../contracts/deploy/events-8453.json)). Disputes, slashes, refused refunds,
disputes closed without a ruling and failed reputation writes fail the run and email the owner.

## Recovery checklist

- **Stuck job or dispute:** anyone can call `closeUndecided` after the vote window and
  `expireDispute` after the arbiter deadline; the validator keeper does this automatically.
  After the job deadline the escrow returns the budget to the client (`claimRefund`, or
  `claimRefundTo` when the client's address cannot receive the token).
- **Validator down:** restart the validator kit; a job it accepted must still get its vote inside
  the vote window, or its bond is burned. Keep at least two validators running per committee.
- **Website or API down:** Cloudflare Pages keeps the previous build; roll back to it from the
  Pages dashboard, then fix forward.
- **Leaked validator or operator key:** move its stake out (unstake) from a safe machine, rotate the
  key, and remove any GitHub secret that held it.

## Steps

1. **Acknowledge** the report within 3 business days (as in SECURITY.md) and record it privately (date, reporter, affected
   contract or service, commit).
2. **Assess** severity with the bug bounty scale in [bug-bounty.md](bug-bounty.md). Reproduce on a
   local chain or a fork; never on mainnet funds.
3. **Contain** what people control:
   - Treasury: the guardian cancels any queued timelock operation that the issue affects.
   - Safes: signers stop signing transactions that touch the affected contract.
   - Validators: operator-run validators stop accepting new jobs; jobs they already accepted still
     need their vote within the vote window, or their bonds are burned.
   - Arbiter Safe: signers rule only on disputes they have checked with `checkEvidence`.
   - Website: publish a warning banner and remove links to the affected feature.
4. **Fix**: write the fix with a failing test first, run the full CI, and deploy a new contract
   version when a contract is affected. Existing contracts cannot be changed.
5. **Disclose**: after users are safe, publish what happened, who was affected and what changed,
   on the website and in [CHANGELOG.md](../CHANGELOG.md), and pay the bounty per the policy.

## Contacts

- Email: team@arlcoin.io
- X: https://x.com/arlprotocol
- Telegram: https://t.me/arlprotocol_community
