// Usage: node packages/deploy/src/events-cli.ts <events-config.json> <rpc-url> <lookback-blocks>
//
// Protocol event alerts (events.ts): scans the last <lookback-blocks> blocks of the watched
// contracts, prints the report as JSON and a Markdown summary to $GITHUB_STEP_SUMMARY when set.
// Exit codes: 0 no alert, 3 at least one alert (the scheduled workflow then fails and GitHub
// emails the owner), 1 the scan could not run, 2 wrong usage. Read-only.

import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";

import { clientFor, scan, summary, type EventsConfig } from "./events.ts";

const [configPath, rpcUrl, lookback] = process.argv.slice(2);
if (!configPath || !rpcUrl || !lookback || !/^\d+$/.test(lookback)) {
  process.stderr.write("usage: events-cli.ts <events-config.json> <rpc-url> <lookback-blocks>\n");
  process.exit(2);
}

try {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as EventsConfig;
  const client = clientFor(rpcUrl, config.chainId);
  const head = await client.getBlockNumber();
  const back = BigInt(lookback);
  const report = await scan(client, config, head > back ? head - back : 0n);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (out) appendFileSync(out, summary(report));
  process.exitCode = report.alerts > 0 ? 3 : 0;
} catch (error) {
  process.stderr.write(
    `events failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
