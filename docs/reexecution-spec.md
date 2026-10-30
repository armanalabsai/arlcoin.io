# Re-execution spec (`arl-reexec/1`) and reference verifier

Status: **Built and tested (unit, real container, local chain); no validator runs it.** Code:
[`packages/verifier`](../packages/verifier/src). Used by the `Reexecution` tier of
[`ARLVerifiedEvaluator`](verifiable-execution.md).

The first supported workload is deterministic code execution: running a repository's tests at a
fixed commit in a fixed container and reporting the result, coverage and output hashes. LLM output
is not supported by this tier (it is not bit-reproducible).

## Flow

```
client:    spec.json ──hash──► specHash ──configure(jobId, {specHash, …})──► evaluator
           job description = the spec's URI (https:// or ipfs://)
provider:  arl-verifier run spec.json ──► deliverable (result hash) ──submit──► ARLJobs
validator: read job ──► fetch spec ──► specHash matches? ──► re-run ──► result hash == deliverable
           and acceptance conditions hold? ──► vote(approve | reject, deliverable, evidence)
```

## Spec

A JSON object with exactly these fields (unknown fields are refused):

| Field                  | Meaning                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `version`              | `"arl-reexec/1"`                                                                                          |
| `container_digest`     | Image pinned by digest: `name@sha256:<64 hex>` (a tag alone is refused)                                   |
| `inputs[]`             | `{kind: "git", path, url, commit}` (full commit id) or `{kind: "file", path, url, sha256}`; https or ipfs |
| `command`              | argv; `command[0]` is the entrypoint. No shell is added (a job may run `sh -c` itself)                    |
| `workdir`              | Working directory under `/work` (`"."` for `/work`)                                                       |
| `env`                  | The complete environment of the job; runners add only `HOME=/tmp`                                         |
| `outputs[]`            | Files the job writes under `/out`; only these, and the exit status, form the result                       |
| `limits`               | `{seconds: 1–3600, memory_mb: 64–65536, cpus: 1–64}`                                                      |
| `expected_exit_code`   | Optional: accept only this exit code (for example `0`: all tests must pass)                               |
| `expected_output_hash` | Optional: accept only this result hash (a reproduction of a known result)                                 |
| `verifier_digest`      | Digest of the verifier build that checks the job                                                          |

Paths are relative, without `.` or `..` segments; input paths must not overlap.

**`specHash`** = keccak256 of the UTF-8 bytes of the spec's canonical JSON: keys sorted by UTF-16
code units, no whitespace, strings escaped as ECMAScript `JSON.stringify`, integers only (the
subset of RFC 8785 the spec uses). A test vector is pinned in
[`verifier.test.ts`](../packages/verifier/test/verifier.test.ts) and cross-checked with Python's
`json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)` and `cast keccak`.

## Result

```json
{
  "version": "arl-reexec-result/1",
  "spec_hash": "0x…",
  "exit_code": 0,
  "timed_out": false,
  "outputs": [{ "path": "result.json", "sha256": "…" }]
}
```

Outputs are listed sorted by path; a missing output, or one that is not a regular file (a symlink,
a directory), has `sha256: null`. The **deliverable** is keccak256 of the result's canonical JSON.
Logs and timings are not part of the result: a job must write what matters to `/out`
deterministically (for example a JSON test summary without timings, and `lcov.info`).

A validator approves when its recomputed result hash equals the submitted deliverable and the
spec's acceptance conditions hold. Without conditions, a failing test run reported faithfully is
an approved job: the job was "run these tests and report", and the report is correct.

## Isolation (reference runner)

`DockerRunner` pulls the image by digest, then runs it with:

| Control     | Setting                                                        |
| ----------- | -------------------------------------------------------------- |
| Network     | `--network none` (and `--pull never` for the run)              |
| File system | `--read-only`; `/tmp` tmpfs; `/work` (inputs) and `/out` bound |
| Privileges  | `--cap-drop ALL`, `no-new-privileges`, user `65534:65534`      |
| Resources   | `--memory` = `--memory-swap`, `--cpus`, `--pids-limit 512`     |
| Time        | Killed at `limits.seconds`; the result records `timed_out`     |
| Environment | Exactly `env` plus `HOME=/tmp` (and the image's own `PATH`)    |

Inputs are checked before the run: a file must match its SHA-256, a git checkout must be exactly
`commit`; `.git` is then removed, so the workspace is a function of the commit's tree. Input files
are limited to 256 MiB.

## Command line

```sh
node packages/verifier/src/cli.ts hash  spec.json               # specHash for configure
node packages/verifier/src/cli.ts run   spec.json               # provider: result and deliverable
node packages/verifier/src/cli.ts check spec.json 0x<deliverable>
ARL_VALIDATOR_KEY=0x… node packages/verifier/src/cli.ts vote <rpc> <evaluator> <jobId> spec.json
ARL_VALIDATOR_KEY=0x… node packages/verifier/src/cli.ts watch <rpc> <evaluator> <fromBlock> [state.json]
```

`vote` reads the job, refuses a validator that has not accepted it, re-runs the spec against the
job's committed `specHash` and votes. Base Sepolia and the local chain only; the key is read from
the environment, never from the command line.

`watch` runs a validator unattended. Every 15 seconds it reads the evaluator's `Configured` events
for committees that name the validator, accepts each such job once the provider has approved the
committee and the client has funded it, and when the provider has submitted, fetches the spec from
the job's description (https or ipfs, at most 64 KiB), re-runs it and votes. A spec whose hash
differs from the committed `specHash` is voted down, never run. Progress is kept in `state.json`,
so a restarted validator continues where it stopped. Jobs that are decided drop out of the list.

### Running a validator

A validator needs Base Sepolia ETH for gas, ARL staked on the evaluator (`stake`, at least the
job bonds it accepts), Docker for the job containers, and Node.js 24:

```sh
npm ci
ARL_VALIDATOR_KEY=0x… node packages/verifier/src/cli.ts watch   https://sepolia.base.org 0x6808F80Eb11538543d31cf4b50332B268dDd4d14 48277116
```

Clients open jobs for such a committee with the SDK (`openVerifiedJob` in `@arl/sdk`, which
creates the job and configures the committee in one call) or the app's Jobs and Verified pages.

### Evidence bundle

`bundle` collects one job's settlement evidence into a portable JSON document (`arl-evidence/1`):
the job, the committed spec hash, the submitted deliverable, every validator vote, the decision,
the finalize call and the escrow settlement, each with its block and transaction.
`verify-bundle` checks it offline (committee membership, no double votes, approvals at the
threshold naming the submitted deliverable, outcome matching the escrow) and re-reads every field
from the chain; it exits 1 on any mismatch.

```sh
node packages/verifier/src/cli.ts bundle <rpc> <evaluator> <jobId> <fromBlock> > evidence.json
node packages/verifier/src/cli.ts verify-bundle <rpc> evidence.json <fromBlock>
```

A valid bundle shows how the job was settled and that the approvals re-executed the committed
spec to the submitted result. It does not show that a non-deterministic deliverable is correct.
The bundle of the first Base Sepolia job is [evidence/base-sepolia-job-1.json](evidence/base-sepolia-job-1.json)
(evaluator deployment block 48277116).

## Tests

| Suite       | Command                                | Covers                                                                                                                                                                                                                                                                          |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `npm test -w @arl/verifier`            | Canonical JSON (ordering, escaping, refusals), the pinned spec hash vector, every spec refusal, acceptance, docker arguments, path containment, git checkout check, input hash check, symlinked outputs, decisions                                                              |
| Container   | `npm run test:docker -w @arl/verifier` | Real busybox container: deterministic result across runs, approval, no network, read-only root, uid 65534, exact environment, time limit, faithful report of a failing job and `expected_exit_code`                                                                             |
| Local chain | `npm run test:anvil -w @arl/verifier`  | Compiled ARLToken, ARLJobs and ARLVerifiedEvaluator on Anvil: the ABI matches; accept, read the job and its deliverable, re-run, vote to an approval, finalize and pay; a forged deliverable is rejected; a job opened with the SDK is accepted and voted by `watch` unattended |

## Limits

- Determinism is the job author's responsibility: the command must produce the same outputs from
  the same inputs (fixed seeds, no timestamps or network in outputs). A non-deterministic job is
  rejected by honest validators, which protects the client and costs the provider the job.
- The image's own contents are trusted as pinned by digest; the spec does not rebuild it.
- Dependencies must be inside the image or the inputs: the job has no network.
