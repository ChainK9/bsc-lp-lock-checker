// The only place that talks to a node. Every read is pinned to one block, so custody, lock records and
// "locked until" all describe the same moment. Tests replace this object with a fake of the same shape.
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";

// A revert is an answer ("this contract has no such function"). Anything else is a failed read and must not
// be mistaken for one, so it is thrown.
const REVERT = /revert|invalid opcode|out of gas|returned no data|zero data|0x$/i;

export async function makeRpc(url) {
  const client = createPublicClient({ chain: bsc, transport: http(url, { retryCount: 3 }) });
  const head = await client.getBlock();
  const blockNumber = head.number;
  return {
    blockNumber,
    timestamp: Number(head.timestamp),
    code: async (address) => (await client.getCode({ address, blockNumber })) ?? "0x",
    storage: async (address, slot) => (await client.getStorageAt({ address, slot, blockNumber })) ?? "0x",
    call: async (to, data) => {
      try {
        return (await client.call({ to, data, blockNumber })).data ?? null;
      } catch (e) {
        if (REVERT.test(`${e.shortMessage ?? ""} ${e.details ?? ""} ${e.message ?? ""}`)) return null;
        throw e;
      }
    },
    read: (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args, blockNumber }),
    multicall: (contracts) => client.multicall({ contracts, blockNumber, allowFailure: true }),
  };
}
