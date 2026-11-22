import { readFileSync } from "node:fs";
import { getAddress, isAddress } from "viem";

export const ABIS = ["pinklock-v2", "uncx-v2", "dxsale-lp", null];

export function loadRegistry(path = new URL("../lockers.json", import.meta.url)) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Problems with a registry, as strings. Empty means valid. */
export function validateRegistry(rows) {
  const problems = [];
  const seen = new Set();
  if (!Array.isArray(rows) || rows.length === 0) return ["registry must be a non-empty array"];
  for (const [i, r] of rows.entries()) {
    const at = `row ${i} (${r?.project} ${r?.version})`;
    if (!isAddress(r.address ?? "", { strict: false })) problems.push(`${at}: address is not valid`);
    else if (getAddress(r.address) !== r.address) problems.push(`${at}: address is not checksummed (${getAddress(r.address)})`);
    if (seen.has(r.address?.toLowerCase())) problems.push(`${at}: duplicate address`);
    seen.add(r.address?.toLowerCase());
    if (!/^0x[0-9a-f]{64}$/.test(r.code_hash ?? "")) problems.push(`${at}: code_hash must be 0x + 64 lowercase hex`);
    if (!r.project || !r.version) problems.push(`${at}: project and version are required`);
    if (!ABIS.includes(r.abi)) problems.push(`${at}: abi must be one of ${ABIS.join(", ")}`);
    if (typeof r.abi_confirmed !== "boolean") problems.push(`${at}: abi_confirmed must be a boolean`);
    if (r.abi === null && r.abi_confirmed) problems.push(`${at}: abi_confirmed is true but abi is null`);
    if (r.records_note !== undefined && (typeof r.records_note !== "string" || r.abi !== null)) problems.push(`${at}: records_note must be a string, on a row without a record reader`);
    if (!Array.isArray(r.sources) || r.sources.length === 0 || r.sources.some((u) => !/^https:\/\//.test(u))) problems.push(`${at}: sources must be a non-empty list of https URLs`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.checked ?? "")) problems.push(`${at}: checked must be YYYY-MM-DD`);
    if (!Array.isArray(r.incidents)) problems.push(`${at}: incidents must be a list`);
    else for (const inc of r.incidents) if (!inc.date || !inc.summary || !Array.isArray(inc.urls) || inc.urls.length === 0) problems.push(`${at}: an incident needs date, summary and urls`);
  }
  return problems;
}
