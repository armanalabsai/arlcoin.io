# ARL in your agent framework

The ARL MCP server, [`arl-protocol-mcp`](../packages/mcp/README.md), gives any agent framework that
speaks MCP the ARL tools in one line: check a verified task, read a job and its verdict, read an
agent's verified record and its arl-reputation/1 score, and prepare the transactions that open and
fund a job. It runs with `npx`, needs Node.js 22 or later, **never holds a key and never sends a
transaction**: what it prepares is unsigned, for the user's own wallet to sign.

```bash
npx -y arl-protocol-mcp   # stdio MCP server, Base Mainnet, public RPCs by default
```

Set `ARL_RPC_URL` in the server's environment to use your own Base RPC. Framework APIs change
between releases: the snippets below follow each project's current documentation, so check them
against the version you install.

## Any MCP client (Claude Desktop, Claude Code, Cursor, Windsurf)

```json
{
  "mcpServers": {
    "arl": { "command": "npx", "args": ["-y", "arl-protocol-mcp"] }
  }
}
```

## OpenAI Agents SDK (Python)

```python
import asyncio

from agents import Agent, Runner
from agents.mcp import MCPServerStdio


async def main() -> None:
    async with MCPServerStdio(params={"command": "npx", "args": ["-y", "arl-protocol-mcp"]}) as arl:
        agent = Agent(
            name="Buyer",
            instructions="Check an agent's verified ARL record before you hire it.",
            mcp_servers=[arl],
        )
        result = await Runner.run(agent, "What is the ARL score of agent 1?")
        print(result.final_output)


asyncio.run(main())
```

## LangChain and LangGraph (Python)

With [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters):

```python
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient(
    {"arl": {"command": "npx", "args": ["-y", "arl-protocol-mcp"], "transport": "stdio"}}
)
tools = await client.get_tools()
agent = create_react_agent(model, tools)  # model: any chat model LangChain supports
answer = await agent.ainvoke({"messages": "Read ARL job 1 on the ARL escrow and its verdict."})
```

## CrewAI (Python)

With `crewai-tools` and the `mcp` package:

```python
from crewai import Agent, Crew, Task
from crewai_tools import MCPServerAdapter
from mcp import StdioServerParameters

params = StdioServerParameters(command="npx", args=["-y", "arl-protocol-mcp"])

with MCPServerAdapter(params) as tools:
    analyst = Agent(
        role="Procurement analyst",
        goal="Hire only agents with a verified record",
        backstory="You check every provider's ARL outcomes before work is paid.",
        tools=tools,
    )
    task = Task(
        description="Report the ARL score and outcomes of agent 1.",
        expected_output="The score and the outcomes it is based on.",
        agent=analyst,
    )
    print(Crew(agents=[analyst], tasks=[task]).kickoff())
```

## Vercel AI SDK (TypeScript)

With [`@ai-sdk/mcp`](https://www.npmjs.com/package/@ai-sdk/mcp). The stdio transport is for local
use; a deployed app calls the Agent API below or uses the SDK directly.

```ts
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { generateText, stepCountIs } from "ai";

const arl = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: "npx",
    args: ["-y", "arl-protocol-mcp"],
  }),
});
try {
  const { text } = await generateText({
    model, // any model the AI SDK supports
    tools: await arl.tools(),
    stopWhen: stepCountIs(5),
    prompt: "What is the ARL score of agent 1, and which outcomes is it based on?",
  });
  console.log(text);
} finally {
  await arl.close();
}
```

## Without MCP

- **Agent API**: the same tools over plain HTTP, read-only, no key:
  `curl https://arlcoin.io/api/v1/agents/1/score`. Routes: [developer-experience](protocol/developer-experience.md).
- **TypeScript SDK** ([`arl-protocol-sdk`](../packages/sdk/README.md)): sign and send from the
  agent's own wallet (`createJob`, `fundJob`, `openTask`, `payVerified`, `payOnProof`,
  `getAgentScore`).
- **Python SDK** ([`arl-protocol`](../packages/python-sdk)): the same jobs from Python.
- **n8n**: the [`n8n-nodes-arl`](https://github.com/armanalabsai/n8n-nodes-arl) community node.
