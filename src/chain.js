// BNB Smart Chain constants. PancakeSwap V2 only: V3/V4 positions are NFTs and are not read here.
import { parseAbi } from "viem";

export const FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"; // PancakeSwap V2
export const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
export const USDT = "0x55d398326f99059fF775485246999027B3197955";
export const DEAD = "0x000000000000000000000000000000000000dEaD";
export const ZERO = "0x0000000000000000000000000000000000000000";

// EIP-1967 slots: bytes32(uint256(keccak256("eip1967.proxy.<x>")) - 1)
export const SLOTS = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
};

export const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"]);
export const pairAbi = parseAbi(["function factory() view returns (address)", "function token0() view returns (address)", "function token1() view returns (address)"]);
export const factoryAbi = parseAbi(["function getPair(address,address) view returns (address)"]);

// Both ABIs were read from Sourcify-verified source (exact match) and proved by calls on chain; see the README.
export const pinkAbi = parseAbi([
  "function cumulativeLockInfo(address) view returns (address token, address factory, uint256 amount)",
  "function totalLockCountForToken(address) view returns (uint256)",
  "function getLocksForToken(address token, uint256 start, uint256 end) view returns ((uint256 id, address token, address owner, uint256 amount, uint256 lockDate, uint256 tgeDate, uint256 tgeBps, uint256 cycle, uint256 cycleBps, uint256 unlockedAmount, string description)[])",
]);
export const uncxAbi = parseAbi([
  "function uniswapFactory() view returns (address)",
  "function getNumLocksForToken(address) view returns (uint256)",
  "function tokenLocks(address, uint256) view returns (uint256 lockDate, uint256 amount, uint256 initialAmount, uint256 unlockDate, uint256 lockID, address owner)",
]);
