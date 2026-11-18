// Who controls a contract: owner type, EIP-1967 proxy slots, privileged functions. Facts only, no verdict.
import { decodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseAbi, toFunctionSelector } from "viem";
import { SLOTS, ZERO } from "./chain.js";
import { privilegedPresent } from "./bytecode.js";

const sel = (sig) => toFunctionSelector(sig);
const safeAbi = parseAbi(["function getThreshold() view returns (uint256)", "function getOwners() view returns (address[])"]);
const delayAbi = parseAbi(["function getMinDelay() view returns (uint256)"]);

/**
 * owner() as an address, or null when the contract has no owner(). Only exactly 32 bytes with the top
 * 12 bytes zero count: a revert, empty data or anything else is "no owner() function", not "renounced".
 */
export async function readOwner(rpc, contract) {
  const r = await rpc.call(contract, sel("owner()"));
  if (!r || r.length !== 66 || !/^0x0{24}/.test(r)) return null;
  return getAddress("0x" + r.slice(26));
}

/** EIP-7702 delegation designator: 0xef0100 followed by a 20-byte address, 23 bytes in total. */
export function delegationTarget(codeHex) {
  return /^0xef0100[0-9a-f]{40}$/i.test(codeHex) ? getAddress("0x" + codeHex.slice(8)) : null;
}

/**
 * { address, type, ... } where type is one of renounced, eoa, eoa-7702, safe, timelock, contract.
 * A Safe is recognised by getThreshold() and getOwners() both answering; a timelock by getMinDelay().
 */
export async function classifyOwner(rpc, address) {
  const a = getAddress(address);
  if (a === ZERO) return { address: a, type: "renounced" };
  const code = await rpc.code(a);
  if (!code || code === "0x") return { address: a, type: "eoa" };
  const target = delegationTarget(code);
  if (target) return { address: a, type: "eoa-7702", delegatesTo: target };
  const thr = await rpc.call(a, encodeFunctionData({ abi: safeAbi, functionName: "getThreshold" }));
  const own = thr && (await rpc.call(a, encodeFunctionData({ abi: safeAbi, functionName: "getOwners" })));
  if (thr && own) {
    try {
      const [threshold] = decodeAbiParameters([{ type: "uint256" }], thr);
      const [owners] = decodeAbiParameters([{ type: "address[]" }], own);
      return { address: a, type: "safe", threshold: Number(threshold), owners: owners.length };
    } catch { /* not a Safe after all: fall through */ }
  }
  const delay = await rpc.call(a, encodeFunctionData({ abi: delayAbi, functionName: "getMinDelay" }));
  if (delay && delay.length === 66) return { address: a, type: "timelock", minDelaySeconds: Number(BigInt(delay)) };
  return { address: a, type: "contract" };
}

export function describeOwner(o) {
  switch (o.type) {
    case "renounced": return `${o.address} (owner() returns the zero address: renounced, or never set)`;
    case "eoa": return `${o.address} (externally owned account: no code at the address)`;
    case "eoa-7702": return `${o.address} (externally owned account with an EIP-7702 delegation to ${o.delegatesTo})`;
    case "safe": return `${o.address} (Safe, ${o.threshold} of ${o.owners})`;
    case "timelock": return `${o.address} (timelock, minimum delay ${o.minDelaySeconds} s)`;
    default: return `${o.address} (contract, not a recognised Safe or timelock)`;
  }
}

const slotAddress = (v) => (v && /^0x0{24}[0-9a-f]{40}$/i.test(v) && BigInt(v) !== 0n ? getAddress("0x" + v.slice(26)) : null);

/** EIP-1967 implementation, admin and beacon, plus the admin's own owner type when the admin is a contract with owner(). */
export async function readProxy(rpc, address) {
  const [impl, admin, beacon] = (await Promise.all(Object.values(SLOTS).map((s) => rpc.storage(address, s)))).map(slotAddress);
  const out = { implementation: impl, admin: null, beacon };
  if (admin) {
    const adminOwner = await readOwner(rpc, admin);
    out.admin = { ...(await classifyOwner(rpc, admin)), owner: adminOwner ? await classifyOwner(rpc, adminOwner) : null };
  }
  return out;
}

/** Everything the report says about one locker contract. */
export async function lockerFacts(rpc, address) {
  const code = await rpc.code(address);
  const owner = await readOwner(rpc, address);
  const proxy = await readProxy(rpc, address);
  const implCode = proxy.implementation ? await rpc.code(proxy.implementation) : null;
  return {
    address: getAddress(address),
    codeHash: keccak256(code),
    owner: owner ? await classifyOwner(rpc, owner) : null, // null: the contract has no owner() function
    proxy,
    privileged: privilegedPresent(code),
    implementationPrivileged: implCode ? privilegedPresent(implCode) : null,
  };
}
