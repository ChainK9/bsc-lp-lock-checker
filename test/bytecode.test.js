import { test } from "node:test";
import assert from "node:assert/strict";
import { toFunctionSelector } from "viem";
import { codeHasSelector, hex, privilegedPresent, pushedSelectors } from "../src/bytecode.js";

const s = (sig) => toFunctionSelector(sig).slice(2);
const PUSH4 = "63", PUSH32 = "7f", STOP = "00", JUMPDEST = "5b", POP = "50";

test("selectors inside PUSH data are not read as code", () => {
  // PUSH4 transferOwnership, POP, PUSH32 whose data starts with PUSH4 renounceOwnership
  const c = "0x" + PUSH4 + s("transferOwnership(address)") + POP + PUSH32 + PUSH4 + s("renounceOwnership()") + "00".repeat(27);
  const found = pushedSelectors(hex(c));
  assert.ok(found.has(s("transferOwnership(address)")));
  assert.ok(!found.has(s("renounceOwnership()")));
});

test("unreachable bytes after STOP are skipped, and the walk resumes at the next JUMPDEST", () => {
  const c = "0x" + PUSH4 + s("transferOwnership(address)") + STOP + PUSH4 + s("changeAdmin(address)") + JUMPDEST + PUSH4 + s("upgradeTo(address)");
  const found = pushedSelectors(hex(c));
  assert.ok(found.has(s("transferOwnership(address)")));
  assert.ok(!found.has(s("changeAdmin(address)")));
  assert.ok(found.has(s("upgradeTo(address)")));
});

test("the solc metadata trailer is dropped before reading", () => {
  // trailer = CBOR map header a1 + a byte pattern that looks like PUSH4 pause(); its length (6) is the last two bytes
  const c = "0x" + PUSH4 + s("upgradeTo(address)") + "a1" + PUSH4 + s("pause()") + "0006";
  const found = pushedSelectors(hex(c));
  assert.ok(found.has(s("upgradeTo(address)")));
  assert.ok(!found.has(s("pause()")));
});

test("codeHasSelector takes raw bytes", () => {
  const c = hex("0x" + PUSH4 + s("upgradeTo(address)"));
  assert.equal(codeHasSelector(c, hex(s("upgradeTo(address)"))), true);
  assert.equal(codeHasSelector(c, hex(s("pause()"))), false);
});

test("privilegedPresent groups the known signatures by category", () => {
  const sigs = ["transferOwnership(address)", "setMigrator(address)", "emergencyWithdraw()", "setFee(uint256)", "upgradeToAndCall(address,bytes)"];
  const c = "0x" + sigs.map((x) => PUSH4 + s(x)).join(POP);
  assert.deepEqual(privilegedPresent(c), {
    ownership: ["transferOwnership(address)"],
    upgrade: ["upgradeToAndCall(address,bytes)"],
    rescue: ["emergencyWithdraw()"],
    fees: ["setFee(uint256)"],
    migrator: ["setMigrator(address)"],
  });
  assert.deepEqual(privilegedPresent("0x6080604052"), {});
});
