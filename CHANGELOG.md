# Changelog

## 0.1.0 (2026-11-19)

- First release: `bsc-lp-lock-checker <token|pair>` for PancakeSwap V2 on BNB Smart Chain.
- `lockers.json`: 14 BSC locker rows (PinkSale, DxSale, UNCX, Team Finance, DeepLock, GoPlus) with
  runtime code hashes, sources and incident links, confirmed on chain on 2026-11-18.
- Custody read through Multicall3 and reported next to, never added to, the locked amounts.
- Lock records for PinkLock02 and UNCX V2, only when the code hash matches the registry and the ABI is
  confirmed; classified `time_locked`, `time_elapsed`, `withdrawn` or `unsupported`, fail-closed.
- Admin facts per locker: owner type (EOA, EIP-7702 EOA, Safe k-of-n, timelock, contract, renounced, no
  `owner()`), EIP-1967 slots and the admin's owner, and privileged function signatures in the code.
- `scripts/check-registry.mjs` compares every row's code hash with the chain.
- Not in this release: V3/V4 position lockers, records for DxSale, Team Finance, DeepLock and GoPlus.
