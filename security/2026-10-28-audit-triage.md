# Aderyn triage after the 2026-10-28 audit fixes

The audit fixes moved two lines that were already triaged in [2026-10-17/triage.md](2026-10-17/triage.md) and
added one result. All are recorded in `security/aderyn-baseline.json`.

| Result                                                    | Verdict        | Reason                                                                                                                                                                     |
| --------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H `reentrancy-state-change`, `ARLAnonymousSignal.sol:180` | False positive | Was line 175. `verifier.verify` is `view` (STATICCALL); the verifier address is immutable.                                                                                 |
| L `require-revert-in-loop`, `ARLAnonymousSignal.sol:210`  | By design      | Was line 201. One invalid commitment must revert the whole call.                                                                                                           |
| L `redundant-statement`, `ARLAnonymousSignal.sol:200`     | By design      | `isNullifierUsed` keeps its `groupId` parameter for interface compatibility (F-1 made nullifiers global); the bare `groupId;` marks it as intentionally unused. No effect. |
