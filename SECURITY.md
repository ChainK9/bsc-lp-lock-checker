# Security

`bsc-lp-lock-checker` is a read-only tool. It sends JSON-RPC reads (`eth_getBlockByNumber`, `eth_getCode`,
`eth_getStorageAt`, `eth_call`) to the RPC you choose. It never signs or sends a transaction, never
holds a key and makes no other network requests.

- **RPC URLs** often embed API keys. Output and error messages cut URLs to scheme://host. If you find a
  path where one leaks, report it.
- **Reads run against contracts you point it at.** `eth_call` does not change state. A token or pair
  address you pass can be any contract, so the tool treats everything it reads as untrusted: a pair
  must be listed by the PancakeSwap V2 factory, and lock records are read only from registry lockers
  whose runtime code hash matches the pinned hash.
- **Results are facts, not safety advice.** A clean report does not mean a token or a locker is safe,
  and a long list of privileged functions does not mean it is unsafe. See the README limits.
- **`lockers.json` is maintained by hand** from public sources, each row checked on chain. If an
  address, code hash or source is wrong, or a locker is missing, that is a bug: open an issue.

## Reporting

- Bugs, wrong registry rows, wrong numbers: open an issue.
- Anything you would rather not post publicly: email hello@chaink9.com.

Never put RPC URLs with API keys in issues, logs or pull requests.
