# arl-protocol-mcp

An [MCP](https://modelcontextprotocol.io) server for [ARL Protocol](https://arlcoin.io) on Base
Mainnet. It lets an AI agent check verified tasks, read jobs and prepare the transactions that open
and fund a job. **It never holds a key and never sends a transaction**: every transaction it
prepares is unsigned, for the user's own wallet to sign.

## Add it to your MCP client

```json
{
  "mcpServers": {
    "arl": { "command": "npx", "args": ["-y", "arl-protocol-mcp"] }
  }
}
```

Set `ARL_RPC_URL` in the server's environment to use your own Base RPC; by default it uses public
endpoints and the first answer wins. Requires Node.js 22 or later.

## Tools

| Tool                  | What it does                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `arl_check_task`      | Validates an `arl-task/1` task and checks it against its `arl-policy/1` policy; returns its hashes |
| `arl_list_policies`   | The built-in verification policies and their hashes                                                |
| `arl_get_job`         | A job on the ARL or USDC escrow: status, budget, committee and verdict, at one named block         |
| `arl_get_agent_outcomes` | An agent's verified approvals and rejections, as both evaluators count them (`outcomesOf`)     |
| `arl_get_job_audit`      | Every on-chain event of a job in order: who acted, when, in which transaction, with what hashes |
| `arl_get_job_receipt`    | A finalized job's portable receipt and the unsigned EAS `attest` call that records it          |
| `arl_get_agent_score`    | An agent's arl-reputation/1 score from verified outcomes only, with the outcomes it used       |
| `arl_get_agent`          | An agent's passport: ERC-8004 identity (owner, stated name) and its verified record            |
| `arl_list_validators`    | Every validator that staked: stake, locked bonds, jobs accepted, votes and slashes             |
| `arl_get_trust_graph`    | Every agent with a verified outcome, its score, and an edge per client and agent               |
| `arl_check_evidence`  | Checks an `arl-evidence/2` package offline                                                         |
| `arl_prepare_job`     | Step 1: the unsigned `createJob` transaction for a task                                            |
| `arl_prepare_funding` | Step 2: the unsigned `configure`, `setBudget`, `approve` and `fund` transactions for that job      |

`arl_prepare_funding` checks that the job is the one step 1 created for the same task (client,
provider, evaluator and on-chain description) before preparing anything that moves funds.

The same tools answer over HTTP at `https://arlcoin.io/api/v1` (`GET /policies`,
`POST /tasks/check`, `GET /jobs/ARL/{id}`, `GET /jobs/ARL/{id}/audit`, `GET /jobs/ARL/{id}/audit.csv`, `GET /jobs/ARL/{id}/receipt`, `GET /agents/{agentId}`, `GET /agents/{agentId}/outcomes`, `GET /agents/{agentId}/score`, `GET /agents/{agentId}/badge.svg`, `GET /graph`, `GET /validators`, `POST /evidence/check`, `POST /jobs/prepare`,
`POST /jobs/prepare-funding`), for agents that do not speak MCP.

The task format is specified in
[spec/arl-task](https://github.com/armanalabsai/arlcoin.io/tree/main/spec/arl-task/v0.1.0). The same
transactions are sent by `openTask` in [`arl-protocol-sdk`](https://www.npmjs.com/package/arl-protocol-sdk).

License: Apache-2.0.
