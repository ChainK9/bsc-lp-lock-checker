// The checker: pair -> LP custody -> lock records (only where the registry says they can be trusted) -> admin facts.
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress } from "viem";
import { DEAD, ZERO, FACTORY, WBNB, USDT, erc20Abi, pairAbi, factoryAbi, pinkAbi, uncxAbi } from "./chain.js";
import { lockerFacts } from "./owner.js";
import { redact } from "./redact.js";
import { assessPink, assessUncx, buckets, MAX_RECORDS } from "./records.js";

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

async function addressCall(rpc, to, abi, fn) {
  const r = await rpc.call(to, encodeFunctionData({ abi, functionName: fn }));
  if (!r || r.length !== 66) return null;
  return decodeFunctionResult({ abi, functionName: fn, data: r });
}

/**
 * The PancakeSwap V2 pair to check. A pair argument is accepted only if its factory() is PancakeSwap V2 AND
 * the factory lists that exact pair for its two tokens (a lookalike contract can fake factory()).
 * A token argument gets its pair against WBNB, then USDT.
 */
export async function resolvePair(rpc, input) {
  if (!isAddress(input ?? "", { strict: false })) throw new Error("expected a token or PancakeSwap V2 pair address (0x...)");
  const addr = getAddress(input);
  const f = await addressCall(rpc, addr, pairAbi, "factory");
  if (f) {
    if (!same(f, FACTORY)) throw new Error(`${addr} looks like a pair of another DEX (factory ${f}), not PancakeSwap V2`);
    const [t0, t1] = [await addressCall(rpc, addr, pairAbi, "token0"), await addressCall(rpc, addr, pairAbi, "token1")];
    const listed = t0 && t1 && (await rpc.read(FACTORY, factoryAbi, "getPair", [t0, t1]));
    if (!listed || !same(listed, addr)) throw new Error(`${addr} claims PancakeSwap V2 but the factory does not list it`);
    return { pair: addr, token0: t0, token1: t1, via: "pair address given" };
  }
  for (const [name, quote] of [["WBNB", WBNB], ["USDT", USDT]]) {
    if (same(addr, quote)) continue;
    const p = await rpc.read(FACTORY, factoryAbi, "getPair", [addr, quote]);
    if (!same(p, ZERO)) {
      const [t0, t1] = [await addressCall(rpc, p, pairAbi, "token0"), await addressCall(rpc, p, pairAbi, "token1")];
      return { pair: getAddress(p), token0: t0, token1: t1, via: `${name} pair of the token given`, token: addr };
    }
  }
  throw new Error(`no PancakeSwap V2 pair against WBNB or USDT for ${addr}`);
}

async function pinkRecords(rpc, row, pair, custody, now) {
  const info = await rpc.read(row.address, pinkAbi, "cumulativeLockInfo", [pair]);
  const count = Number(await rpc.read(row.address, pinkAbi, "totalLockCountForToken", [pair]));
  const records = [];
  if (count <= MAX_RECORDS) {
    // end is inclusive: getLocksForToken(t, 0, 0) returns one record (checked on chain)
    for (let s = 0; s < count; s += 50) records.push(...(await rpc.read(row.address, pinkAbi, "getLocksForToken", [pair, BigInt(s), BigInt(Math.min(s + 49, count - 1))])));
  }
  return assessPink({ pair, factory: FACTORY, custody, info: { token: info[0], factory: info[1], amount: info[2] }, count, records, now });
}

async function uncxRecords(rpc, row, pair, custody, now) {
  const factory = await rpc.read(row.address, uncxAbi, "uniswapFactory");
  if (!same(factory, FACTORY)) return { verified: false, reason: "this UNCX locker is not the PancakeSwap V2 one" };
  const count = Number(await rpc.read(row.address, uncxAbi, "getNumLocksForToken", [pair]));
  let records = [];
  if (count <= MAX_RECORDS && count > 0) {
    const res = await rpc.multicall(Array.from({ length: count }, (_, i) => ({ address: row.address, abi: uncxAbi, functionName: "tokenLocks", args: [pair, BigInt(i)] })));
    if (res.some((x) => x.status !== "success")) return { verified: false, reason: "a lock record could not be read" };
    records = res.map((x) => ({ lockDate: x.result[0], amount: x.result[1], initialAmount: x.result[2], unlockDate: x.result[3], lockID: x.result[4], owner: x.result[5] }));
  }
  return assessUncx({ custody, count, records, now });
}

// Records are read only for a locker whose runtime code is exactly the pinned code and whose ABI was confirmed.
async function assess(rpc, row, pair, custody, codeHash) {
  if (codeHash !== row.code_hash) return { verified: false, reason: "the locker's code is not the code pinned in the registry" };
  if (!row.abi || !row.abi_confirmed) return { verified: false, reason: "no confirmed record reader for this locker (custody only)" };
  try {
    return row.abi === "pinklock-v2" ? await pinkRecords(rpc, row, pair, custody, rpc.timestamp) : await uncxRecords(rpc, row, pair, custody, rpc.timestamp);
  } catch (e) {
    return { verified: false, reason: `records could not be read: ${redact((e.shortMessage ?? e.message).split("\n")[0])}` };
  }
}

export async function check(rpc, registry, input) {
  const found = await resolvePair(rpc, input);
  const holders = [...registry.map((r) => r.address), DEAD, ZERO];
  const res = await rpc.multicall([
    { address: found.pair, abi: erc20Abi, functionName: "totalSupply" },
    ...holders.map((h) => ({ address: found.pair, abi: erc20Abi, functionName: "balanceOf", args: [h] })),
  ]);
  if (res.some((x) => x.status !== "success")) throw new Error("could not read the pair's LP balances");
  const [supply, ...bal] = res.map((x) => x.result);
  const burned = bal[registry.length] + bal[registry.length + 1];

  const lockers = [];
  for (const [i, row] of registry.entries()) {
    if (bal[i] === 0n) continue;
    const facts = await lockerFacts(rpc, row.address);
    lockers.push({ row, custody: bal[i], facts, assessment: await assess(rpc, row, found.pair, bal[i], facts.codeHash) });
  }
  return { block: Number(rpc.blockNumber), timestamp: rpc.timestamp, ...found, supply, burned, lockers, shares: buckets({ supply, burned, lockers }) };
}
