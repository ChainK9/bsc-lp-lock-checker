# bsc-lp-lock-checker

Check whether a BNB Smart Chain token's liquidity is really locked, until when, and who controls the
lock.

"LP locked" is the badge traders trust most. This tool checks it on chain. Give it a token address
and it shows how much of the PancakeSwap V2 liquidity is burned, how much is locked and until which
date, and who controls each locker contract holding it: a single wallet, a multisig, or nobody. It
also ships `lockers.json`, an open list of BSC locker contracts with their sources.

```bash
npx bsc-lp-lock-checker 0xToken
```

Made by [ChainK9](https://chaink9.com). The PinkLock reader comes from ChainK9's engine, where it has
checked LP locks since October 2026. Sibling tools:
[bsc-honeypot-benchmark](https://github.com/ChainK9/bsc-honeypot-benchmark) (fake scam tokens for testing
scanners) and [bsc-block-time](https://github.com/ChainK9/bsc-block-time) (block numbers to real dates).

## Why

A "locked LP" badge is only as safe as the locker contract that holds the LP. In May 2026 the old
DxSale lockers on BSC were drained of about $7.3M across 1,400+ pools. The cause is disputed:
[BlockSec](https://blocksec.com/blog/web3-security-dxsale-squidrouter-more) describes logic flaws in
`unlockToken`, while [Rekt](https://rekt.news/dxsale-rekt) describes an ownership transfer to the
attacker followed by owner-privileged unlocks. This tool does not claim it would have flagged that: it
reads who the locker's owner is and which privileged functions exist, and neither fact shows a logic
bug. It exists because the locker is part of the trust story and its own facts are not published in the
open.

What exists today: GoPlus reports lock status for BSC lockers but is closed source and does not score
the locker's own admin powers. DefiLlama-Adapters has the locker addresses, bare, inside TVL adapters.
This repo puts them in one checked file and reads the admin facts on chain.

## Who uses it, and how

- **Traders, before buying.** "LP locked" on a launch page is a claim. `npx bsc-lp-lock-checker <token>`
  shows how much LP is really burned or time-locked, until when, and who controls the locker that
  holds it.
- **Wallets, bots and AI agents.** `--json` gives the same answer in a form a program can gate a buy
  on: for example, refuse when less than half the LP is burned or time-locked past next month.
- **Launchpads, listing sites and token pages.** Show verified lock facts instead of a badge, and link
  to the registry row the facts came from.
- **Security researchers.** `lockers.json` is one checked list of BSC lockers, with code hashes,
  sources, owners and incidents. Use it to watch lockers whose owner or code changes.

## Quick start

Node 20 or newer. One dependency ([viem](https://viem.sh)).

```bash
npx bsc-lp-lock-checker 0xTokenOrPancakeV2Pair
```

Add `--json` for machine-readable output. `--rpc <url>` or the `BSC_RPC` environment variable picks the
node (default: `https://bsc-rpc.publicnode.com`). RPC URLs never appear in output or errors, only
scheme://host. All reads are pinned to one block, and "locked until" uses that block's timestamp.

The argument is a token or a pair. A token is looked up on the PancakeSwap V2 factory against WBNB,
then USDT. A pair is accepted only if its `factory()` is PancakeSwap V2 and the factory lists that exact
pair for its two tokens.

Real output (BSC, 2026-11-18):

```
Pair 0x3a9FE63d00B03FB01Fe707107e2707De343611c5 (PancakeSwap V2, pair address given)
Block 134297177, 2026-11-18 10:41 UTC; LP supply 11,892.134633

Burned (0xdead, 0x0):            0.00%
Time-locked, records verified:   58.40%   earliest unlock 2030-10-14 17:01 UTC
Held by a locker, not verified as locked:  21.40%
Other holders:                   20.20%

Locker UNCX Network UniswapV2Locker (PancakeSwap V2)  0xC765bddB93b0D1c1A88282BA0fa6B2d00E3e0c83
  custody: 9,490.14 LP = 79.80% of supply (balanceOf the locker; locked amounts below are a subset, not an addition)
  records: 3 read, verified: 2 time_locked, 1 time_elapsed
    #0 time_locked  3,566.97 LP, unlock 2030-10-14 17:01 UTC  lock owner 0x023bAD37AA1cc72911eD58B191669B7e17dd05cB
    #1 time_elapsed  2,545.29 LP, unlock 2026-10-18 15:26 UTC  lock owner 0x023bAD37AA1cc72911eD58B191669B7e17dd05cB
    #2 time_locked  3,377.88 LP, unlock 2030-10-14 17:01 UTC  lock owner 0x023bAD37AA1cc72911eD58B191669B7e17dd05cB
  admin facts (read 2026-11-18 10:41 UTC; facts, not a verdict):
    owner: 0x31c44A17aa2E639B40f33DA805CB1DB55d969693 (Safe, 2 of 3)
    EIP-1967: not a proxy (all three slots empty)
    functions in code: ownership: transferOwnership(address), renounceOwnership(); fees: setFees(uint256,uint256,uint256,uint256,uint256,uint256), setDev(address), whitelistFeeAccount(address,bool); migrator: setMigrator(address), setMigrationIn(address)
  UNCX note: the locker's owner can set a migrator, and the lock owner's migrate() call in the verified source has no unlock-date check. This tool cannot read whether a migrator is set, so "time-locked" here means the date in the record, not a guarantee the LP stays until then.

A function being present in the code says it exists, not who can call it or whether it can reach locked LP. Custody and locked amounts overlap and are not added. See the README limits.
```

## What it reports

1. **Shares of the LP supply**, four buckets that add up to 100%:
   - burned (held by `0x...dEaD` or the zero address),
   - time-locked, from lock records that were read and verified, with the earliest unlock date in UTC,
   - held by a locker but not verified as time-locked (elapsed locks, vesting, no readable records),
   - other holders.
2. **Custody per locker**, as a separate memo line: `balanceOf(locker)`. Locked amounts are a subset of
   custody. The two are shown side by side and never added.
3. **Lock records**, read only when the locker's runtime code hash equals the registry's pinned hash
   and the row's ABI is confirmed. Each record is `time_locked`, `time_elapsed`, `withdrawn` or
   `unsupported` (vesting, a partly withdrawn simple lock, an unlock date the reader cannot interpret).
   The rule is fail-closed: if a locker's custody does not cover its own outstanding total, a record
   belongs to another token, a date or amount is impossible, or there are more than 200 records, the
   whole locker is reported as "records not verified" and its custody goes in the unverified bucket.
4. **Admin facts for each locker that holds LP**, with no verdict:
   - owner type: externally owned account, EOA with an EIP-7702 delegation (code `0xef0100...`), Safe
     k-of-n, timelock (`getMinDelay`), other contract, renounced (zero address), or "no `owner()`
     function" (not the same thing as renounced),
   - EIP-1967 implementation, admin and beacon slots, and the admin's own owner type,
   - which privileged function signatures appear in the runtime code (and the implementation's):
     ownership, upgrade, rescue/emergency, fee setters, migrator, pause.

## The registry

`lockers.json`, 14 BSC rows, each confirmed on chain with `eth_getCode` at `bsc-rpc.publicnode.com`
(on 2026-11-18; the three DxSale rows with verified source again on 2026-11-22). Fields: `address`,
`project`, `version`, `code_hash` (keccak-256 of the runtime code), `abi` (`pinklock-v2`, `uncx-v2`,
`dxsale-lp` or `null`), `abi_confirmed`, `sources`, `checked`, `incidents`, `notes`, and an optional
`records_note` that says why a row without a reader has none. `abi_confirmed` is true only where
verified source was read and the functions were proved by calls on chain; every other row is
custody-only.

| Project | Version | Address | Records | Code hash | Sources |
|---|---|---|---|---|---|
| PinkSale | PinkLock02 | `0x407993575c91ce7643a4d4cCACc9A98c36eE1BBE` | pinklock-v2 (confirmed) | `0x88172df7` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/pinksale/index.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x407993575c91ce7643a4d4cCACc9A98c36eE1BBE) |
| PinkSale | PinkLock (proxy) | `0x7ee058420e5937496F5a2096f04caA7721cF70cc` | custody only | `0x330b9f1a` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/pinksale/index.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x7ee058420e5937496F5a2096f04caA7721cF70cc) |
| DxSale | legacy locker (DefiLlama: LockersV3) | `0xEb3a9C56d963b971d320f889bE2fb8B59853e449` | custody only: opens early (see below) | `0x9235c786` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/dxsale/config.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0xEb3a9C56d963b971d320f889bE2fb8B59853e449), [BlockSec](https://blocksec.com/blog/web3-security-dxsale-squidrouter-more) |
| DxSale | legacy locker (DefiLlama: LockersV3) | `0x8655E5c4D701186D16765d1CDcef6D5287E4679a` | dxsale-lp (confirmed) | `0xf4ad4d81` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/dxsale/config.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x8655E5c4D701186D16765d1CDcef6D5287E4679a) |
| DxSale | legacy locker (DefiLlama: LockersV3) | `0x5b5e94485c9628793B01A38762921Dc37B6829b6` | dxsale-lp (confirmed) | `0x43e1dd3e` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/dxsale/config.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x5b5e94485c9628793B01A38762921Dc37B6829b6) |
| DxSale | legacy locker (commented out in DefiLlama) | `0x81E0eF68e103Ee65002d3Cf766240eD1c070334d` | custody only | `0x89dcc2f3` | [Rekt](https://rekt.news/dxsale-rekt), [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/dxsale/config.js) |
| DxSale | legacy locker (commented out in DefiLlama) | `0x2D045410f002A95EFcEE67759A92518fA3FcE677` | custody only | `0x17123b18` | [Rekt](https://rekt.news/dxsale-rekt), [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/dxsale/config.js) |
| UNCX Network | UniswapV2Locker (PancakeSwap V2) | `0xC765bddB93b0D1c1A88282BA0fa6B2d00E3e0c83` | uncx-v2 (confirmed) | `0x23157a45` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/unicrypt/config.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0xC765bddB93b0D1c1A88282BA0fa6B2d00E3e0c83) |
| Team Finance | AdminUpgradeabilityProxy (implementation: LockToken) | `0x0C89C0407775dd89b12918B9c0aa42Bf96518820` | custody only | `0x17404120` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/team-finance/config.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x0C89C0407775dd89b12918B9c0aa42Bf96518820) |
| Team Finance | lockToken | `0x7536592bb74b5d62eB82e8b93b17eed4eed9A85c` | custody only | `0x6d2f98f6` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/team-finance/config.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x7536592bb74b5d62eB82e8b93b17eed4eed9A85c) |
| DeepLock | v1 | `0x10dD7FD1Bf3753235068ea757f2018dFef94B257` | custody only | `0x58bf40a1` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/deeplock/index.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x10dD7FD1Bf3753235068ea757f2018dFef94B257) |
| DeepLock | v2 | `0x3f4D6bf08CB7A003488Ef082102C2e6418a4551e` | custody only | `0x91735a24` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/deeplock/index.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x3f4D6bf08CB7A003488Ef082102C2e6418a4551e) |
| GoPlus | Locker V2 | `0xF17A08A7d41F53B24AD07Eb322CBBdA2ebdeC04b` | custody only | `0x7de6a4d6` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/goplus-locker-v2/index.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0xF17A08A7d41F53B24AD07Eb322CBBdA2ebdeC04b) |
| GoPlus | Locker V2 (second deployment) | `0x7AA03D4b9051cF299e7A2272953D0590FEE485A4` | custody only | `0x25050175` | [DefiLlama](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/goplus-locker-v2/index.js), [Sourcify](https://sourcify.dev/server/v2/contract/56/0x7AA03D4b9051cF299e7A2272953D0590FEE485A4) |

Notes on how the rows were built:

- DefiLlama-Adapters modules read: `pinksale`, `dxsale`, `unicrypt`, `team-finance`, `deeplock`,
  `goplus-locker-v2`. GoPlus's [Supported Locker](https://docs.gopluslabs.io/reference/supported-locker)
  page was used for names only: it lists no addresses, so no row rests on it.
- "Sourcify" links are the API record for that address. A row with no Sourcify link had no verified
  source there on the check date.
- PinkLock02 and the UNCX V2 locker are Sourcify exact matches. Their record functions were read from
  that source and called on chain before the readers were written.
- The three DxSale rows with a Sourcify link are Sourcify matches: the runtime code matches the
  source, the metadata hash does not. `0x8655...` and `0x5b5e...` are built from the same file,
  `DxLock_LP_5b5e.sol`, and `0xEb3a...` from an older `DxLock_LP.sol`. The DxSale reader was written
  from that source and its functions were called on both lockers on 2026-11-22.
- Two proxies (PinkLock proxy, Team Finance AdminUpgradeabilityProxy): the code hash pins the proxy, not the implementation
  behind it. That is acceptable only because no records are read for them.
- Two DxSale rows come from Rekt's write-up, which says their ownership was transferred to the same
  address as the drained locker. DefiLlama lists them commented out. All five DxSale rows returned the
  same `owner()` on 2026-11-18: an externally owned account (no code at the address).
- Left out on purpose: UNCX lockers for other DEX factories (this checker reads PancakeSwap V2 pairs
  only), the DxSale storage contracts (their records point at separate per-lock contracts, so they do
  not hold LP themselves), Mudra and gempad (no primary-source address found: DefiLlama has no module
  for them, and GoPlus's page lists no addresses).

Run `node scripts/check-registry.mjs` to compare every row's code hash with the chain.

## Checked against the chain

Lock records were compared on 2026-11-18 with PinkSale's own lock pages
(`pinksale.finance/pinklock/bsc/<LP address>`) and with independent raw `eth_call`s (a separate script
with no shared code, using `getLockById`):

- Three PinkLock02 locks (unlock dates 2027-03-26, 2027-05-21 and 2029-07-11): the raw calls matched
  exactly on token, amount, lock date and unlock timestamp. PinkSale's page, checked for the last two
  and for the millisecond lock below, shows the same amount and unlock time (to the minute) and the
  same lock owner.
- One UNCX V2 pair with three records (two locked to 2030-10-14, one elapsed 2026-10-18): amounts,
  dates and owners matched, and custody equalled locked plus elapsed.
- One LP that is 100% burned (`0x...dEaD` plus the 1,000 wei of `MINIMUM_LIQUIDITY` at the zero address).
- PinkLock02 stores the unlock date as given. Recent locks often hold a value that looks like a
  millisecond timestamp (for example `1826533471950`): all 14 recent PinkLock02 LP locks sampled on
  2026-11-18 did. Read as seconds that is past the year 59,000.
  PinkSale's page shows such a lock as `59850.07.17`. The verified source has no early unlock path and
  `editLock` cannot move a date earlier, so the tool counts such a lock as time-locked and prints the stored value and what it would be as milliseconds.
  It does not guess what the owner meant.

DxSale locks were compared on 2026-11-22, between 21:10 and 21:25 UTC, with each lock's own record,
`DXLOCKERLP(owner, n)`, read by a separate script that walks `LockerRecord`:

- Two `0x8655...` locks on one pair (unlock 2070-10-20 and 2099-10-20) and one `0x5b5e...` lock
  (2027-03-01): the index entries the tool reads matched the lock records on amount, unlock date and
  pair, and custody equalled the locked total. Calling `unlockToken` from the `0x5b5e...` lock's owner
  reverts with "tokens are still locked".
- A pair where one of two `0x8655...` locks (dated 2021-09-02) was withdrawn: the index still lists
  both as locked, custody is below their total, and the tool reports the records as not verified.
- A `0x8655...` lock whose index entry says 2021-08-26: its own record says 2023-12-21, because it was
  extended later. Index dates are never later than the real date, so the tool's dates err early.
- `0xEb3a...`: calling `unlockToken` from the owners of four locks dated 2028, 2031, 2069 and 2099
  succeeds now, years before their dates. The tool reports that locker's records as not read and
  counts none of its LP as time-locked.

## Honest limits

- **Admin facts are not a verdict.** A privileged function existing in the code says it exists. The tool
  does not read who may call it, whether it can touch locked LP, or whether a lock can be bypassed. It
  cannot see logic bugs, which is the part of the DxSale incident that BlockSec describes.
- **UNCX migrator.** In the verified UNCX V2 source, a lock owner's `migrate()` has no unlock-date check
  and uses a migrator the locker's owner sets. There is no public getter for the migrator, so the tool
  cannot tell whether one is set. For UNCX, "time-locked" means the date in the record.
- **Only PancakeSwap V2 pairs.** Not V3 or V4 position lockers, and no discovery of every LP holder from
  logs. Holders other than the registry's lockers, `0x...dEaD` and the zero address show up only as
  "other holders", including lockers that are not in the registry.
- **DxSale records come from an index of copies.** The two `DxLock_LP_5b5e` lockers keep each lock twice:
  its own record under the lock owner, and a copy under each of the pair's tokens. Only the copies can be
  found from a pair, and a copy has no lock owner and is never updated when a lock is extended, withdrawn
  or released. So the tool shows no lock owner, the date it shows can only be earlier than the real one,
  and it trusts a pair's locks only while the locker still holds all of them. A pair with any lock
  withdrawn is reported as not verified. LP sent straight to the locker, outside a lock, could hide a
  withdrawal; the tool cannot rule that out.
- **DxSale owner release.** In the verified `DxLock_LP_5b5e` source the locker's owner can release any
  lock before its date with `platformRelease(address,uint256)`, which sends the LP back to the lock
  owner. For DxSale, "time-locked" means the date in the record.
- **The older DxSale locker (`0xEb3a...`) has no time lock.** Its verified `unlockToken` pays out before
  the unlock date and leaves the lock open, so a lock owner can withdraw early and more than once. Its
  records are not read, and none of its LP counts as time-locked. The two DxSale rows from Rekt have no
  verified source and stay custody-only.
- **Records only for PinkLock02, UNCX V2 and the two newer DxSale lockers.** Team Finance, DeepLock,
  GoPlus and the PinkLock proxy get custody and admin facts only. Their records are not parsed yet.
- **Records are capped at 200 per locker and pair**, then reported as not verified.
- **The code hash pins exact deployed code.** A redeployed locker at a new address is not in the registry
  until someone adds it. A proxy row pins only the proxy.
- **Owner type** is read at the block shown. An owner can change, and an EOA's code can change with
  EIP-7702. A Safe is recognised by `getThreshold` and `getOwners`; a lookalike contract can answer
  both.
- **Percentages are rounded** to two decimals from integer LP balances. The 1,000 wei that every V2 pair
  burns at the zero address counts as burned.
- BSC only.

## Roadmap

- Weekly: add one or two lockers to `lockers.json` from GoPlus's list of BSC lockers, each confirmed
  against verified source. Order: Team Finance records, Mudra, DeepLock, gempad. Each gets a record
  parser where the ABI allows.
- An incident log: registry rows gain dated `incidents` entries when a locker is exploited or changes
  owner.
- PancakeSwap V3 position (NFT) lockers, then Uniswap V4 positions.
- A library API with JSON output for wallets and bots, and a tool in `chaink9-mcp` that uses it.

See [CHANGELOG.md](CHANGELOG.md).

## Development

```bash
npm ci
node --test                          # offline, no network
node scripts/check-registry.mjs      # network: registry code hashes against the chain
```

MIT licensed. [chaink9.com](https://chaink9.com) checks tokens on BSC, Ethereum and Base by forking
the chain and trading them.
