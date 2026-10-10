// Rehearsal only: sets Node's clock to ARL_REHEARSAL_CLOCK (unix seconds), so the deployment
// tooling can be run on a fork whose block time is after the TGE. Loaded with
// `node --import ./scripts/rehearsal-clock.mjs ...` by scripts/rehearse-base-mainnet-fork.sh.
// It changes nothing on chain: the Solidity network gate reads the fork's own block time.
import process from "node:process";

const seconds = Number(process.env.ARL_REHEARSAL_CLOCK);
if (!Number.isInteger(seconds) || seconds <= 0)
  throw new Error("ARL_REHEARSAL_CLOCK must be unix seconds");
const RealDate = Date;
const fixed = seconds * 1000;
class RehearsalDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fixed);
    else super(...args);
  }
  static now() {
    return fixed;
  }
}
globalThis.Date = RehearsalDate;
