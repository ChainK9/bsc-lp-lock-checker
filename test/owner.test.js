import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeFunctionData, getAddress, parseAbi, toFunctionSelector } from "viem";
import { classifyOwner, readOwner, readProxy, delegationTarget } from "../src/owner.js";
import { SLOTS, ZERO } from "../src/chain.js";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const word = (hex) => "0x" + hex.replace(/^0x/, "").padStart(64, "0");

// A fake node: code by address, answers keyed by `${to}:${selector}` (null = revert), storage by `${address}:${slot}`.
function fake({ code = {}, answers = {}, storage = {} }) {
  const key = (a) => a.toLowerCase();
  return {
    code: async (a) => code[key(a)] ?? "0x",
    call: async (to, data) => answers[`${key(to)}:${data.slice(0, 10)}`] ?? null,
    storage: async (a, slot) => storage[`${key(a)}:${slot}`] ?? word("0"),
  };
}
const sel = (s) => toFunctionSelector(s);
const safe = parseAbi(["function getThreshold() view returns (uint256)", "function getOwners() view returns (address[])"]);

test("no code is an EOA, the zero address is renounced", async () => {
  const rpc = fake({});
  assert.equal((await classifyOwner(rpc, A)).type, "eoa");
  assert.equal((await classifyOwner(rpc, ZERO)).type, "renounced");
});

test("code starting 0xef0100 is an EIP-7702 delegation to the 20 bytes after it", async () => {
  const code = "0xef0100" + "ab".repeat(20);
  assert.equal(delegationTarget(code), getAddress("0x" + "ab".repeat(20)));
  const r = await classifyOwner(fake({ code: { [A]: code } }), A);
  assert.equal(r.type, "eoa-7702");
  assert.equal(r.delegatesTo, getAddress("0x" + "ab".repeat(20)));
  assert.equal(delegationTarget("0xef0100"), null); // wrong length
  assert.equal(delegationTarget("0x6080"), null);
});

test("a contract answering getThreshold and getOwners is a Safe k-of-n", async () => {
  const answers = {
    [`${A}:${sel("getThreshold()")}`]: word("2"),
    [`${A}:${sel("getOwners()")}`]: encodeAbiParameters([{ type: "address[]" }], [[B, A, ZERO]]),
  };
  const r = await classifyOwner(fake({ code: { [A]: "0x6080" }, answers }), A);
  assert.deepEqual([r.type, r.threshold, r.owners], ["safe", 2, 3]);
  assert.ok(encodeFunctionData({ abi: safe, functionName: "getThreshold" }).startsWith(sel("getThreshold()")));
});

test("getMinDelay marks a timelock; a plain contract is 'contract'", async () => {
  const tl = await classifyOwner(fake({ code: { [A]: "0x6080" }, answers: { [`${A}:${sel("getMinDelay()")}`]: word((172800).toString(16)) } }), A);
  assert.deepEqual([tl.type, tl.minDelaySeconds], ["timelock", 172800]);
  assert.equal((await classifyOwner(fake({ code: { [A]: "0x6080" } }), A)).type, "contract");
});

test("owner(): a revert or odd data is 'no owner function', never 'renounced'", async () => {
  const L = "0x3333333333333333333333333333333333333333";
  const o = sel("owner()");
  assert.equal(await readOwner(fake({}), L), null); // revert
  assert.equal(await readOwner(fake({ answers: { [`${L}:${o}`]: "0x" } }), L), null);
  assert.equal(await readOwner(fake({ answers: { [`${L}:${o}`]: "0x" + "ff".repeat(32) } }), L), null); // dirty top bytes
  assert.equal(await readOwner(fake({ answers: { [`${L}:${o}`]: word(A) } }), L), getAddress(A));
  assert.equal(await readOwner(fake({ answers: { [`${L}:${o}`]: word("0") } }), L), ZERO); // a real zero address answer
});

test("EIP-1967 slots are read, and the admin's own owner is classified", async () => {
  const P = "0x4444444444444444444444444444444444444444";
  const rpc = fake({
    code: { [B]: "0x6080" },
    storage: { [`${P}:${SLOTS.implementation}`]: word(A), [`${P}:${SLOTS.admin}`]: word(B) },
    answers: { [`${B}:${sel("owner()")}`]: word(A) },
  });
  const r = await readProxy(rpc, P);
  assert.equal(r.implementation, getAddress(A));
  assert.equal(r.beacon, null);
  assert.equal(r.admin.address, getAddress(B));
  assert.equal(r.admin.type, "contract");
  assert.equal(r.admin.owner.type, "eoa");
  assert.deepEqual(await readProxy(fake({}), P), { implementation: null, admin: null, beacon: null });
});
