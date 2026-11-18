// Runtime-bytecode reading: which function selectors a contract's dispatcher pushes.
import { toFunctionSelector } from "viem";

export const hex = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));

// Drops solc's CBOR metadata trailer (its length is in the last two bytes) so its hash bytes are never read as opcodes.
export function stripMetadata(code) {
  if (code.length >= 2) {
    const n = (code[code.length - 2] << 8) | code[code.length - 1];
    if (n > 0 && n + 2 <= code.length && (code[code.length - n - 2] & 0xe0) === 0xa0) return code.slice(0, code.length - n - 2);
  }
  return code;
}

// Calls fn(opcode, operandStart, code) for each real opcode: PUSH operands and the metadata trailer are skipped.
function walk(code, fn) {
  code = stripMetadata(code);
  let ended = false;
  let skipping = false;
  for (let i = 0; i < code.length; i++) {
    const op = code[i];
    // After STOP/JUMP/RETURN/REVERT/INVALID/SELFDESTRUCT only a JUMPDEST can be reached again. Anything else
    // is unreachable (constant data, dead code): skip it up to the next JUMPDEST instead of stopping the walk.
    if (skipping && op !== 0x5b) continue;
    skipping = false;
    if (ended && op !== 0x5b) { skipping = true; continue; }
    ended = [0x00, 0x56, 0xf3, 0xfd, 0xfe, 0xff].includes(op);
    fn(op, i + 1, code);
    if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; // PUSH1..PUSH32
  }
}

/** Every 4-byte value pushed by PUSH4, as a lowercase hex string without 0x. */
export function pushedSelectors(code) {
  const out = new Set();
  walk(code, (op, at, c) => {
    if (op === 0x63 && c.length >= at + 4) out.add(Buffer.from(c.slice(at, at + 4)).toString("hex"));
  });
  return out;
}

/** True if `selector` (4 bytes) is pushed by PUSH4, the way solc's dispatcher does it. */
export function codeHasSelector(code, selector) {
  return pushedSelectors(code).has(Buffer.from(selector).toString("hex"));
}

// Functions that change who can move funds, what they cost, or what the code is. "Present in bytecode" is
// a fact about the code; who may call them, and whether they can touch locked LP, is not read here.
export const PRIVILEGED = {
  ownership: ["transferOwnership(address)", "renounceOwnership()", "changeAdmin(address)"],
  upgrade: ["upgradeTo(address)", "upgradeToAndCall(address,bytes)"],
  rescue: [
    "emergencyWithdraw()", "emergencyWithdraw(address)", "emergencyWithdraw(address,uint256)", "platformRelease(address,uint256)",
    "recoverAssets(address,address)", "recoverERC20(address,uint256)", "recoverTokens(address,uint256)", "rescueTokens(address,uint256)",
    "rescueFunds()", "sweep(address)", "forceUnlock(uint256)", "adminWithdraw(address,uint256)", "ownerWithdraw(address,uint256)",
  ],
  fees: [
    "setFee(uint256)", "setFees(uint256,uint256,uint256,uint256,uint256,uint256)", "changeFees(uint256)", "setBnbFee(uint256)", "setLpFee(uint256)",
    "setFeesInUSD(uint256)", "setFeeParams(address,address,uint256,address)", "setCompanyWallet(address)", "updateFeeReceiver(address)",
    "changeLockFeesAcc(address)", "addOrUpdateFee(string,uint24,uint256,address,bool)", "setDev(address)", "setPoolManager(address)",
    "whitelistFeeAccount(address,bool)", "withdrawFee()", "withdrawFees()", "withdrawFees(address)",
  ],
  migrator: ["setMigrator(address)", "setMigrationIn(address)"],
  pause: ["pause()", "unpause()"],
};

/** Which PRIVILEGED signatures appear in `codeHex`: { category: [signature] }, empty categories left out. */
export function privilegedPresent(codeHex) {
  const pushed = pushedSelectors(hex(codeHex));
  const out = {};
  for (const [cat, sigs] of Object.entries(PRIVILEGED)) {
    const hit = sigs.filter((s) => pushed.has(toFunctionSelector(s).slice(2)));
    if (hit.length) out[cat] = hit;
  }
  return out;
}
