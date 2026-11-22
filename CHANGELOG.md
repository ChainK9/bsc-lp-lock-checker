# Changelog

## 0.2.0 (2026-11-23)

- DxSale lock records for the two `DxLock_LP_5b5e` lockers (`0x8655...`, `0x5b5e...`), `abi: "dxsale-lp"`.
  They come from the locker's per-token index: no lock owner, dates that can only err early, and a pair's
  locks count only while the locker still holds all of them. Fail-closed like the other readers.
- A DxSale note in the report: the locker's owner can release any lock early with
  `platformRelease(address,uint256)`.
- The older DxSale locker (`0xEb3a...`) now says why its records are not read: its verified
  `unlockToken` pays out before the unlock date, more than once. New optional registry field
  `records_note`.
- `scripts/check-registry.mjs` also checks the DxSale reader's functions.

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
