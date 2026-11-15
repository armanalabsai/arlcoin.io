# @arl/agentkit

[ARL Protocol](https://arlcoin.io) actions for [Coinbase AgentKit](https://github.com/coinbase/agentkit):
an AgentKit agent can check an [arl-task/1](../../spec/arl-task) task, read verified jobs and open
a task as a verified job on Base Mainnet, paid from its own wallet.

```ts
import { AgentKit, customActionProvider } from "@coinbase/agentkit";
import { z } from "zod";
import { arlActions } from "@arl/agentkit";

const agentkit = await AgentKit.from({
  walletProvider, // any EVM wallet provider on Base Mainnet
  actionProviders: [customActionProvider(arlActions(z))],
});
```

Pass the `z` your AgentKit setup uses (zod 3 or 4), so the schemas match it.

| Action               | What it does                                                                     | Sends |
| -------------------- | -------------------------------------------------------------------------------- | ----- |
| `arl_check_task`     | Validates a task and checks it against its arl-policy/1 policy                   | no    |
| `arl_list_policies`  | Lists the built-in verification policies and their hashes                        | no    |
| `arl_get_job`        | Reads a job, its committee and its verdict at one block                          | no    |
| `arl_check_evidence` | Checks an arl-evidence/2 package offline                                         | no    |
| `arl_open_task`      | Creates, configures, budgets, approves and funds the task's job (5 transactions) | yes   |

The read actions are the [MCP server](../mcp)'s tools, so they give the same answers. `arl_open_task`
validates the task before anything is sent, then signs through the wallet provider exactly the
transactions the MCP server, the SDK and the Agent API (`https://arlcoin.io/api/v1`) prepare. The
funding step checks that the new job is this task's job before any money moves. The package
never holds a key.

The wallet needs the task's budget in its payment token (ARL or USDC) and a little ETH for gas.
After the job is funded, the provider approves the committee and the validators check the work.

License: Apache-2.0.
