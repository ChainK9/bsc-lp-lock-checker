// Result -> text or JSON. Custody and locked amounts are separate lines and are never added together.
import { describeOwner } from "./owner.js";
import { pct } from "./records.js";

const utc = (t) => (t > 253402300799 ? `after year 9999 (stored value ${t})` : new Date(t * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC");
// pct() rounds to 0.01%, so a dust amount (raw > 0) would read as "0.00%" next to a real unlock date.
const p = (x, raw = 0n) => (x === null ? "n/a" : x === 0 && raw > 0n ? "<0.01%" : `${x.toFixed(2)}%`);
const lp = (x) => (Number(x) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 6 });

const UNCX_NOTE = "UNCX note: the locker's owner can set a migrator, and the lock owner's migrate() call in the verified source has no unlock-date check. This tool cannot read whether a migrator is set, so \"time-locked\" here means the date in the record, not a guarantee the LP stays until then.";

export function toJson(r) {
  return JSON.parse(JSON.stringify(r, (k, v) => (typeof v === "bigint" ? v.toString() : k === "row" ? { address: v.address, project: v.project, version: v.version, code_hash: v.code_hash } : v)));
}

export function report(r, { json } = {}) {
  if (json) return JSON.stringify(toJson(r), null, 2);
  const s = r.shares;
  const out = [
    `Pair ${r.pair} (PancakeSwap V2, ${r.via})`,
    `Block ${r.block}, ${utc(r.timestamp)}; LP supply ${lp(r.supply)}`,
    "",
    `Burned (0xdead, 0x0):            ${p(s.burned.pct, s.burned.lp)}`,
    `Time-locked, records verified:   ${p(s.timeLocked.pct, s.timeLocked.lp)}${s.timeLocked.earliestUnlock ? `   earliest unlock ${utc(s.timeLocked.earliestUnlock)}` : ""}`,
    `Held by a locker, not verified as locked:  ${p(s.heldUnverified.pct, s.heldUnverified.lp)}`,
    `Other holders:                   ${p(s.other.pct, s.other.lp)}`,
  ];
  if (!s.consistent) out.push("warning: balances add up to more than the LP supply; do not trust these shares");
  if (!r.lockers.length) out.push("", "No registry locker holds this LP.");
  for (const l of r.lockers) {
    out.push("", `Locker ${l.row.project} ${l.row.version}  ${l.row.address}`, `  custody: ${lp(l.custody)} LP = ${p(pct(l.custody, r.supply), l.custody)} of supply (balanceOf the locker; locked amounts below are a subset, not an addition)`);
    const a = l.assessment;
    if (!a.verified) out.push(`  records: not verified: ${a.reason}`);
    else {
      const by = {};
      for (const x of a.records) (by[x.status] ??= []).push(x);
      out.push(`  records: ${a.records.length} read, verified${a.records.length ? ": " + Object.entries(by).map(([k, v]) => `${v.length} ${k}`).join(", ") : ""}`);
      for (const x of a.records.slice(0, 10)) out.push(`    #${x.id} ${x.status}  ${lp(x.remaining)} LP${x.status === "time_locked" || x.status === "time_elapsed" ? `, unlock ${utc(x.unlockAt)}` : ""}${x.why ? ` (${x.why})` : ""}  lock owner ${x.owner}`);
      if (a.records.length > 10) out.push(`    ... ${a.records.length - 10} more (use --json)`);
    }
    out.push(`  admin facts (read ${utc(r.timestamp)}; facts, not a verdict):`);
    out.push(`    owner: ${l.facts.owner ? describeOwner(l.facts.owner) : "none: the contract has no owner() function"}`);
    const px = l.facts.proxy;
    if (px.implementation || px.admin || px.beacon) {
      out.push(`    EIP-1967: implementation ${px.implementation ?? "none"}, admin ${px.admin ? describeOwner(px.admin) : "none"}, beacon ${px.beacon ?? "none"}`);
      if (px.admin?.owner) out.push(`    admin's owner: ${describeOwner(px.admin.owner)}`);
    } else out.push("    EIP-1967: not a proxy (all three slots empty)");
    const show = (label, pr) => {
      const cats = Object.entries(pr ?? {}).map(([c, sigs]) => `${c}: ${sigs.join(", ")}`);
      out.push(`    ${label}: ${cats.length ? cats.join("; ") : "none of the listed signatures"}`);
    };
    show("functions in code", l.facts.privileged);
    if (l.facts.implementationPrivileged) show("functions in implementation", l.facts.implementationPrivileged);
    if (l.row.abi === "uncx-v2") out.push(`  ${UNCX_NOTE}`);
    for (const inc of l.row.incidents) out.push(`  incident note (${inc.date}): ${inc.summary} ${inc.urls.join(" ")}`);
  }
  out.push("", "A function being present in the code says it exists, not who can call it or whether it can reach locked LP. Custody and locked amounts overlap and are not added. See the README limits.");
  return out.join("\n");
}
