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

test("locks Iraqi and Sudanese particles to MSA", () => {
  const out = lockTranslationToOfficialRegister("شلون شنو أكو ماكو", "ar");
  assert.match(out, /كيف/);
  assert.match(out, /ماذا/);
  assert.match(out, /يوجد/);
  assert.match(out, /لا يوجد/);
  assert.doesNotMatch(out, /شلون/);
  assert.doesNotMatch(out, /شنو/);
  assert.doesNotMatch(out, /أكو/);
  assert.doesNotMatch(out, /ماكو/);
});

