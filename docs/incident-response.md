# Incident response

What happens when a security problem is reported or found. ARL contracts have **no pause, no
upgrade and no owner** (by design), so a contract bug cannot be patched in place: the response is
to warn users, stop the parts that are run by people (Safes, the testnet operator, the website),
and, if needed, deploy a fixed version and move to it.

## Who acts

The project has one maintainer today (see [branch-protection.md](branch-protection.md)). Reports
go to team@arlcoin.io with "Security" in the subject, as described in [SECURITY.md](../SECURITY.md).
Safe actions need the signers of the Safe concerned (see [mainnet-plan.md](mainnet-plan.md)).

## Detection

The [Uptime](../.github/workflows/uptime.yml) workflow checks every 10 minutes that the website,
the app page, the testnet operator API and the Base Sepolia RPC answer, that the faucet holds at
least 20 claims and that staking rewards run for at least 3 more days. A failed check fails the run
and GitHub notifies the owner by email and in the mobile app. The [Monitor mainnet](../.github/workflows/monitor.yml)
workflow does the same for the Base Mainnet deployment once it is recorded.

## Steps

1. **Acknowledge** the report within 3 business days (as in SECURITY.md) and record it privately (date, reporter, affected
   contract or service, commit).
2. **Assess** severity with the bug bounty scale in [bug-bounty.md](bug-bounty.md). Reproduce on a
   local chain or a fork; never on mainnet funds.
3. **Contain** what people control:
   - Treasury: the guardian cancels any queued timelock operation that the issue affects.
   - Safes: signers stop signing transactions that touch the affected contract.
   - Testnet operator: remove `ARL_OPERATOR_KEY` from the Cloudflare Pages project's variables
     and redeploy; the contracts keep working without it ([operator-api.md](operator-api.md)).
   - Website: publish a warning banner and remove links to the affected feature.
4. **Fix**: write the fix with a failing test first, run the full CI, and deploy a new contract
   version when a contract is affected. Existing contracts cannot be changed.
5. **Disclose**: after users are safe, publish what happened, who was affected and what changed,
   on the website and in [CHANGELOG.md](../CHANGELOG.md), and pay the bounty per the policy.

## Contacts

- Email: team@arlcoin.io
- X: https://x.com/arlprotocol
- Telegram: https://t.me/arlcoin_community
