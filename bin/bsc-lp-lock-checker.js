#!/usr/bin/env node
import { parseArgs } from "node:util";
import { makeRpc } from "../src/rpc.js";
import { check } from "../src/check.js";
import { loadRegistry, validateRegistry } from "../src/registry.js";
import { report } from "../src/report.js";
import { redact } from "../src/redact.js";

const HELP = `bsc-lp-lock-checker: who holds a BSC token's PancakeSwap V2 liquidity, and what the locker's admin can do

  bsc-lp-lock-checker <token|pair>      burned, time-locked and locker-held LP, plus each locker's admin facts

  --rpc <url>   BSC RPC (default: env BSC_RPC, else a public node)
  --json        machine-readable output
`;

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { rpc: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" } },
});
const rpcUrl = opt.rpc || process.env.BSC_RPC || "https://bsc-rpc.publicnode.com";


try {
  if (opt.help || positionals.length !== 1) {
    console.log(HELP);
    process.exit(opt.help ? 0 : 1);
  }
  const registry = loadRegistry();
  const bad = validateRegistry(registry);
  if (bad.length) throw new Error("lockers.json is invalid: " + bad[0]);
  const result = await check(await makeRpc(rpcUrl), registry, positionals[0]);
  console.log(report(result, { json: opt.json }));
} catch (e) {
  console.error("error: " + redact((e.shortMessage ?? e.message).split("\n")[0]));
  process.exit(1);
}
