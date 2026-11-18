import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPink, assessUncx, buckets, pct, MAX_RECORDS } from "../src/records.js";
import { FACTORY } from "../src/chain.js";

const PAIR = "0x00000000000000000000000000000000000000a1";
const OWNER = "0x00000000000000000000000000000000000000b2";
const NOW = 1_800_000_000;
const e18 = 10n ** 18n;

const pink = (o = {}) => ({ id: 1n, token: PAIR, owner: OWNER, amount: 10n * e18, lockDate: 1_700_000_000n, tgeDate: BigInt(NOW + 1000), tgeBps: 0n, cycle: 0n, cycleBps: 0n, unlockedAmount: 0n, description: "", ...o });
const run = (records, o = {}) =>
  assessPink({ pair: PAIR, factory: FACTORY, custody: 10n * e18, info: { token: PAIR, factory: FACTORY, amount: records.reduce((s, r) => s + r.amount - r.unlockedAmount, 0n) }, count: records.length, records, now: NOW, ...o });

test("pink: a simple future lock is time_locked, a past one time_elapsed", () => {
  const a = run([pink(), pink({ id: 2n, amount: 1n, tgeDate: BigInt(NOW - 5) })], { custody: 11n * e18 });
  assert.equal(a.verified, true);
  assert.deepEqual(a.records.map((r) => r.status), ["time_locked", "time_elapsed"]);
});

test("pink: vesting is unsupported, a fully unlocked record is withdrawn, a partly unlocked simple lock is unsupported", () => {
  const a = run([pink({ tgeBps: 1000n, cycle: 86400n, cycleBps: 500n }), pink({ id: 2n, unlockedAmount: 10n * e18 }), pink({ id: 3n, unlockedAmount: 1n })], { custody: 30n * e18 });
  assert.deepEqual(a.records.map((r) => r.status), ["unsupported", "withdrawn", "unsupported"]);
});

test("pink fail-closed: custody below the locker's own outstanding total", () => {
  const a = run([pink()], { custody: 5n * e18 });
  assert.equal(a.verified, false);
  assert.match(a.reason, /custody is below/);
});

test("pink fail-closed: wrong factory, foreign token, bad state, records over the total, partial reads", () => {
  assert.match(run([pink()], { info: { token: PAIR, factory: "0x0000000000000000000000000000000000000001", amount: 10n * e18 } }).reason, /PancakeSwap V2/);
  assert.match(run([pink({ token: OWNER })]).reason, /another token/);
  assert.match(run([pink({ amount: 0n })]).reason, /invalid lock state/);
  assert.match(run([pink({ unlockedAmount: 11n * e18 })]).reason, /invalid lock state/);
  assert.match(run([pink({ lockDate: BigInt(NOW + 5000) })]).reason, /invalid lock state/); // lockDate not before unlock date
  assert.match(run([pink()], { info: { token: PAIR, factory: FACTORY, amount: 1n } }).reason, /more than/);
  assert.match(run([pink()], { count: 3 }).reason, /read 1 of 3/);
  assert.match(run([pink()], { count: MAX_RECORDS + 1 }).reason, /more than the/);
});

test("pink: a millisecond-looking date stays time_locked and says why", () => {
  const a = run([pink({ tgeDate: 1_826_533_471_950n })]);
  assert.equal(a.records[0].status, "time_locked");
  assert.match(a.records[0].why, /milliseconds/);
});

test("pink: no records at all is verified and empty", () => {
  assert.deepEqual(run([], { info: { token: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000", amount: 0n } }), { verified: true, records: [] });
});

const uncx = (i, o = {}) => ({ lockDate: 1_700_000_000n, amount: 5n * e18, initialAmount: 5n * e18, unlockDate: BigInt(NOW + 1000), lockID: BigInt(i), owner: OWNER, ...o });

test("uncx: amount is what is still locked; 0 is withdrawn; past date is elapsed", () => {
  const a = assessUncx({ custody: 10n * e18, count: 3, now: NOW, records: [uncx(0), uncx(1, { amount: 0n }), uncx(2, { unlockDate: BigInt(NOW - 1) })] });
  assert.deepEqual(a.records.map((r) => r.status), ["time_locked", "withdrawn", "time_elapsed"]);
});

test("uncx fail-closed: records above custody, lockID mismatch, short read, unlock date in ms", () => {
  assert.match(assessUncx({ custody: 4n * e18, count: 1, now: NOW, records: [uncx(0)] }).reason, /more than the locker holds/);
  assert.match(assessUncx({ custody: 9n * e18, count: 1, now: NOW, records: [uncx(7)] }).reason, /lockID/);
  assert.match(assessUncx({ custody: 9n * e18, count: 2, now: NOW, records: [uncx(0)] }).reason, /read 1 of 2/);
  assert.equal(assessUncx({ custody: 9n * e18, count: 1, now: NOW, records: [uncx(0, { unlockDate: 10n ** 12n })] }).records[0].status, "unsupported");
});

test("pct rounds to two decimals and handles zero", () => {
  assert.equal(pct(1n, 3n), 33.33);
  assert.equal(pct(2n, 3n), 66.67);
  assert.equal(pct(999999999999n, 1000000000000n), 100);
  assert.equal(pct(1n, 0n), null);
});

test("buckets add up to the supply; custody is split, not summed with locked", () => {
  const supply = 1000n;
  const verified = { verified: true, records: [{ status: "time_locked", remaining: 300n, unlockAt: 2000 }, { status: "time_locked", remaining: 100n, unlockAt: 1500 }, { status: "time_elapsed", remaining: 50n, unlockAt: 10 }] };
  const b = buckets({ supply, burned: 200n, lockers: [{ custody: 450n, assessment: verified }, { custody: 100n, assessment: { verified: false, reason: "x" } }] });
  assert.equal(b.burned.lp, 200n);
  assert.equal(b.timeLocked.lp, 400n);
  assert.equal(b.timeLocked.earliestUnlock, 1500);
  assert.equal(b.heldUnverified.lp, 150n); // custody 550 minus time-locked 400
  assert.equal(b.other.lp, 250n);
  assert.equal(b.burned.lp + b.timeLocked.lp + b.heldUnverified.lp + b.other.lp, supply);
  assert.equal(b.consistent, true);
});

test("buckets: unverified records never count as locked; over-full balances are flagged", () => {
  const b = buckets({ supply: 100n, burned: 0n, lockers: [{ custody: 120n, assessment: { verified: false, reason: "x" } }] });
  assert.equal(b.timeLocked.lp, 0n);
  assert.equal(b.heldUnverified.lp, 120n);
  assert.equal(b.consistent, false);
  assert.equal(b.timeLocked.earliestUnlock, null);
});
