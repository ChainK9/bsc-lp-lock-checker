// Live check of lockers.json against the chain: every row still has the pinned runtime code, and the two
// rows with a record reader still answer the functions the reader calls. Exit 1 on any difference.
import { keccak256 } from "viem";
import { makeRpc } from "../src/rpc.js";
import { loadRegistry } from "../src/registry.js";
import { FACTORY, pinkAbi, uncxAbi } from "../src/chain.js";

const rpc = await makeRpc(process.env.BSC_RPC || "https://bsc-rpc.publicnode.com");
let bad = 0;
const fail = (m) => { bad++; console.log("FAIL " + m); };

for (const row of loadRegistry()) {
  const hash = keccak256(await rpc.code(row.address));
  if (hash !== row.code_hash) fail(`${row.project} ${row.version} ${row.address}: code hash is ${hash}, registry has ${row.code_hash}`);
  else console.log(`ok   ${row.project} ${row.version} ${row.address}`);
}
try {
  await rpc.read(loadRegistry().find((r) => r.abi === "pinklock-v2").address, pinkAbi, "totalLockCountForToken", [FACTORY]);
  const uncx = loadRegistry().find((r) => r.abi === "uncx-v2").address;
  if ((await rpc.read(uncx, uncxAbi, "uniswapFactory")).toLowerCase() !== FACTORY.toLowerCase()) fail("UNCX locker is not on the PancakeSwap V2 factory");
  await rpc.read(uncx, uncxAbi, "getNumLocksForToken", [FACTORY]);
} catch (e) {
  fail("a record-reader function no longer answers: " + (e.shortMessage ?? e.message).split("\n")[0].replace(/https?:\/\/\S+/g, "[url]"));
}
process.exit(bad ? 1 : 0);
