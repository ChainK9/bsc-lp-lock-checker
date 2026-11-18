// Lock records -> statuses, and statuses -> shares of the LP supply.
// Rule throughout: fail closed. If anything about a locker's records does not add up, the locker's
// records are "not verified" and its custody is reported as held-but-unverified, never as locked.
export const MAX_RECORDS = 200;

// PinkLock stores the unlock date as given. Some locks hold a millisecond timestamp, which read as seconds is
// beyond the year 5000: the contract compares it with block.timestamp in seconds, so such a lock cannot be opened.
const MS_LIKE = 10n ** 11n;
const msNote = (v) => `stored date ${v} is past the year 5000 in seconds; read as milliseconds it would be ${new Date(Number(v)).toISOString().slice(0, 10)}. The contract compares it with block.timestamp in seconds`;

const unverified = (reason) => ({ verified: false, reason });

// A record the checker cannot reason about: report as unsupported and never count it as time-locked.
const entry = (status, remaining, extra) => ({ status, remaining, ...extra });

/**
 * PinkLock v2 records for one pair. `info` is cumulativeLockInfo(pair); `records` are ALL of the pair's
 * records from getLocksForToken; `count` is totalLockCountForToken(pair).
 */
export function assessPink({ pair, factory, custody, info, count, records, now }) {
  if (count > MAX_RECORDS) return unverified(`${count} records, more than the ${MAX_RECORDS} this tool reads`);
  if (records.length !== count) return unverified(`read ${records.length} of ${count} records`);
  if (count === 0) return { verified: true, records: [] };
  if (info.token.toLowerCase() !== pair.toLowerCase() || info.factory.toLowerCase() !== factory.toLowerCase()) {
    return unverified("the locker does not record this LP as a PancakeSwap V2 LP lock");
  }
  if (info.amount > custody) return unverified("records inconsistent: custody is below the locker's own outstanding total");
  const out = [];
  let sum = 0n;
  for (const r of records) {
    if (r.token.toLowerCase() !== pair.toLowerCase()) return unverified("records inconsistent: a record is for another token");
    if (r.amount <= 0n || r.unlockedAmount > r.amount || r.lockDate >= r.tgeDate) return unverified("records inconsistent: invalid lock state");
    const remaining = r.amount - r.unlockedAmount;
    const base = { id: r.id.toString(), owner: r.owner, unlockAt: Number(r.tgeDate) };
    sum += remaining;
    if (r.tgeBps !== 0n || r.cycle !== 0n || r.cycleBps !== 0n) out.push(entry("unsupported", remaining, { ...base, why: "vesting schedule" }));
    else if (remaining === 0n) out.push(entry("withdrawn", 0n, base));
    else if (r.unlockedAmount !== 0n) out.push(entry("unsupported", remaining, { ...base, why: "partly withdrawn simple lock" }));
    else if (r.tgeDate <= BigInt(now)) out.push(entry("time_elapsed", remaining, base));
    else out.push(entry("time_locked", remaining, r.tgeDate >= MS_LIKE ? { ...base, why: msNote(r.tgeDate) } : base));
  }
  if (sum > info.amount) return unverified("records inconsistent: records add up to more than the locker's outstanding total");
  return { verified: true, records: out };
}

/**
 * UNCX V2 records for one pair, all of tokenLocks(pair, 0..count-1). `amount` is what is still locked
 * (initialAmount minus withdrawals); a fully withdrawn record keeps amount 0.
 */
export function assessUncx({ custody, count, records, now }) {
  if (count > MAX_RECORDS) return unverified(`${count} records, more than the ${MAX_RECORDS} this tool reads`);
  if (records.length !== count) return unverified(`read ${records.length} of ${count} records`);
  const out = [];
  let sum = 0n;
  for (const [i, r] of records.entries()) {
    if (r.lockID !== BigInt(i)) return unverified("records inconsistent: lockID does not match the record's index");
    sum += r.amount;
    const base = { id: r.lockID.toString(), owner: r.owner, unlockAt: Number(r.unlockDate) };
    if (r.unlockDate >= 10n ** 10n) out.push(entry("unsupported", r.amount, { ...base, why: "unlock date is not in seconds" }));
    else if (r.amount === 0n) out.push(entry("withdrawn", 0n, base));
    else if (r.unlockDate <= BigInt(now)) out.push(entry("time_elapsed", r.amount, base));
    else out.push(entry("time_locked", r.amount, base));
  }
  if (sum > custody) return unverified("records inconsistent: records add up to more than the locker holds");
  return { verified: true, records: out };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0n);

/** a / b as a percentage rounded to two decimals, from integers. null when b is 0. */
export function pct(a, b) {
  if (b === 0n) return null;
  return Number((a * 10000n + b / 2n) / b) / 100;
}

/**
 * Splits the LP supply into four buckets that add up to the supply:
 *   burned (0xdead and 0x0), time-locked (verified records, still locked), held by a locker but not verified
 *   as time-locked (custody minus time-locked: elapsed, vesting, no records, records not verified), other holders.
 * Custody per locker is reported next to it as a memo and is never added to the locked figure.
 */
export function buckets({ supply, burned, lockers }) {
  const custody = sum(lockers.map((l) => l.custody));
  const locked = sum(lockers.map((l) => (l.assessment?.verified ? sum(l.assessment.records.filter((r) => r.status === "time_locked").map((r) => r.remaining)) : 0n)));
  const held = custody - locked;
  const other = supply - burned - custody;
  const earliest = lockers
    .flatMap((l) => (l.assessment?.verified ? l.assessment.records : []))
    .filter((r) => r.status === "time_locked")
    .reduce((m, r) => (m === null || r.unlockAt < m ? r.unlockAt : m), null);
  return {
    burned: { lp: burned, pct: pct(burned, supply) },
    timeLocked: { lp: locked, pct: pct(locked, supply), earliestUnlock: earliest },
    heldUnverified: { lp: held, pct: pct(held, supply) },
    other: { lp: other, pct: pct(other, supply) },
    consistent: other >= 0n,
  };
}
