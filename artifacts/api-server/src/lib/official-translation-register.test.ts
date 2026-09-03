import assert from "node:assert/strict";
import { test } from "node:test";
import { lockTranslationToOfficialRegister } from "./official-translation-register.js";

test("locks leaked Arabic dialect particles to MSA", () => {
  const out = lockTranslationToOfficialRegister("نعم ليش أنا متعب واش علاش", "ar");
  assert.match(out, /لماذا/);
  assert.match(out, /هل/);
  assert.doesNotMatch(out, /ليش/);
  assert.doesNotMatch(out, /واش/);
  assert.doesNotMatch(out, /علاش/);
});

test("does not rewrite when the target is not Arabic or English", () => {
  const dialect = "ليش أنا تعبان";
  assert.equal(lockTranslationToOfficialRegister(dialect, "fr"), dialect);
});
