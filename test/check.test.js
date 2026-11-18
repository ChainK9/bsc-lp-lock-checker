import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, toFunctionSelector } from "viem";
import { resolvePair } from "../src/check.js";
import { FACTORY, WBNB, USDT, ZERO } from "../src/chain.js";
import { report } from "../src/report.js";

const TOKEN = "0x00000000000000000000000000000000000000c3";
const PAIR = "0x00000000000000000000000000000000000000d4";
const word = (a) => "0x" + a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const sel = (s) => toFunctionSelector(s);

// Fake node for pair resolution. `pairs` maps "tokenA|tokenB" (lowercase) to a pair; `meta` maps pair -> {factory,t0,t1}.
function fake({ pairs: raw = {}, meta = {} }) {
  const pairs = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    call: async (to, data) => {
      const m = meta[to.toLowerCase()];
      if (!m) return null;
      if (data.startsWith(sel("factory()"))) return word(m.factory);
      if (data.startsWith(sel("token0()"))) return word(m.t0);
      if (data.startsWith(sel("token1()"))) return word(m.t1);
      return null;
    },
    read: async (_f, _abi, _fn, [a, b]) => pairs[`${a}|${b}`.toLowerCase()] ?? pairs[`${b}|${a}`.toLowerCase()] ?? ZERO,
  };
}

test("a token resolves to its WBNB pair first, then USDT", async () => {
  const meta = { [PAIR]: { factory: FACTORY, t0: TOKEN, t1: WBNB } };
  const r = await resolvePair(fake({ pairs: { [`${TOKEN}|${WBNB}`]: PAIR }, meta }), TOKEN);
  assert.equal(r.pair, getAddress(PAIR));
  assert.match(r.via, /WBNB/);
  const meta2 = { [PAIR]: { factory: FACTORY, t0: TOKEN, t1: USDT } };
  assert.match((await resolvePair(fake({ pairs: { [`${TOKEN}|${USDT}`]: PAIR }, meta: meta2 }), TOKEN)).via, /USDT/);
});

test("a PancakeSwap V2 pair address is used as given", async () => {
  const meta = { [PAIR]: { factory: FACTORY, t0: TOKEN, t1: WBNB } };
  const r = await resolvePair(fake({ pairs: { [`${TOKEN}|${WBNB}`]: PAIR }, meta }), PAIR);
  assert.equal(r.pair, getAddress(PAIR));
  assert.match(r.via, /pair address/);
});

test("a lookalike that claims the right factory but is not listed by it is rejected", async () => {
  const meta = { [PAIR]: { factory: FACTORY, t0: TOKEN, t1: WBNB } };
  await assert.rejects(resolvePair(fake({ meta }), PAIR), /does not list it/);
});

test("a pair of another DEX is rejected, and a token with no pair says so", async () => {
  const meta = { [PAIR]: { factory: "0x00000000000000000000000000000000000000ee", t0: TOKEN, t1: WBNB } };
  await assert.rejects(resolvePair(fake({ meta }), PAIR), /another DEX/);
  await assert.rejects(resolvePair(fake({}), TOKEN), /no PancakeSwap V2 pair/);
  await assert.rejects(resolvePair(fake({}), "nope"), /expected a token/);
});

test("the text report keeps custody and locked amounts apart and states facts without a verdict", () => {
  const e18 = 10n ** 18n;
  const assessment = { verified: true, records: [{ id: "1", status: "time_locked", remaining: 8n * e18, unlockAt: 1_900_000_000, owner: "0xOwner" }] };
  const result = {
    pair: PAIR, via: "test", block: 1, timestamp: 1_800_000_000, supply: 10n * e18, burned: 1n * e18,
    shares: { burned: { pct: 10 }, timeLocked: { pct: 80, earliestUnlock: 1_900_000_000 }, heldUnverified: { pct: 0 }, other: { pct: 10 }, consistent: true },
    lockers: [{
      custody: 8n * e18, assessment,
      row: { project: "PinkSale", version: "PinkLock02", address: "0xLocker", abi: "pinklock-v2", incidents: [] },
      facts: { owner: null, proxy: { implementation: null, admin: null, beacon: null }, privileged: {}, implementationPrivileged: null },
    }],
  };
  const text = report(result);
  assert.match(text, /Time-locked, records verified:\s+80\.00%/);
  assert.match(text, /custody: 8 LP = 80\.00% of supply/);
  assert.match(text, /no owner\(\) function/);
  assert.doesNotMatch(text, /safe|risky|dangerous|rug/i);
  assert.equal(JSON.parse(report(result, { json: true })).supply, (10n * e18).toString());
});
