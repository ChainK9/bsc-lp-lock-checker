import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";
import { loadRegistry, validateRegistry } from "../src/registry.js";

const rows = loadRegistry();

test("the shipped registry is valid", () => {
  assert.deepEqual(validateRegistry(rows), []);
});

test("every row has a checksummed address, a code hash and sources", () => {
  for (const r of rows) {
    assert.equal(getAddress(r.address), r.address);
    assert.match(r.code_hash, /^0x[0-9a-f]{64}$/);
    assert.ok(r.sources.length > 0);
  }
});

test("only rows with a record reader claim a confirmed ABI", () => {
  for (const r of rows) assert.equal(r.abi_confirmed, r.abi !== null);
  assert.deepEqual(rows.filter((r) => r.abi).map((r) => r.abi).sort(), ["pinklock-v2", "uncx-v2"]);
});

test("the PinkLock02 row keeps the pinned runtime hash", () => {
  const pink = rows.find((r) => r.abi === "pinklock-v2");
  assert.equal(pink.code_hash, "0x88172df766517edffa7d598d05205119ce584cf79509cfa6c7db228921dfb82f");
});

test("DxSale incident rows link BlockSec and Rekt and carry no 'would have' claim", () => {
  const drained = rows.find((r) => r.address === "0xEb3a9C56d963b971d320f889bE2fb8B59853e449");
  const urls = drained.incidents.flatMap((i) => i.urls).join(" ");
  assert.match(urls, /blocksec\.com/);
  assert.match(urls, /rekt\.news/);
  assert.doesNotMatch(JSON.stringify(rows), /would have|would've/i);
});

test("validateRegistry rejects the usual mistakes", () => {
  const good = rows[0];
  const bad = (patch) => validateRegistry([{ ...good, ...patch }]);
  assert.match(bad({ address: "0x123" })[0], /address/);
  assert.match(bad({ address: good.address.toLowerCase() })[0], /checksummed/);
  assert.match(bad({ code_hash: "0xabc" })[0], /code_hash/);
  assert.match(bad({ sources: [] })[0], /sources/);
  assert.match(bad({ abi: "mystery" })[0], /abi/);
  assert.match(bad({ abi: null, abi_confirmed: true })[0], /abi_confirmed/);
  assert.match(validateRegistry([good, good]).join(), /duplicate/);
});
