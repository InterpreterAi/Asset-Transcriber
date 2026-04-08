/**
 * Smoke-test glossary mask + restore (no OpenAI). Run:
 *   pnpm --filter @workspace/api-server exec tsx scripts/verify-interpreter-glossary.ts
 */
import assert from "node:assert/strict";
import {
  initInterpreterGlossaries,
  applyGlossaryPlaceholders,
  restoreGlossaryPlaceholders,
} from "../src/lib/interpreter-glossary.js";

initInterpreterGlossaries();

const cases: { input: string; tgt: string; mustContain: string[] }[] = [
  {
    input: "I reviewed the MRI results.",
    tgt:   "ar",
    mustContain: ["التصوير بالرنين المغناطيسي"],
  },
  {
    input: "You qualify for SSI benefits.",
    tgt:   "ar",
    mustContain: ["دخل الأمن التكميلي", "المنافع"],
  },
  {
    input: "The court issued a subpoena.",
    tgt:   "es",
    mustContain: ["citación judicial"],
  },
  {
    input: "The patient applied for Medicaid.",
    tgt:   "es",
    mustContain: ["Medicaid", "paciente"],
  },
  {
    input: "This case will go to immigration court.",
    tgt:   "es",
    mustContain: ["tribunal de inmigración", "caso"],
  },
];

for (const { input, tgt, mustContain } of cases) {
  const { masked, slotToEntryIndex, hadPlaceholders } = applyGlossaryPlaceholders(input);
  assert(hadPlaceholders, `expected placeholders in: ${input}`);
  assert(masked.includes("TERM_"), `expected TERM_n in masked: ${masked}`);
  const out = restoreGlossaryPlaceholders(masked, slotToEntryIndex, tgt);
  for (const frag of mustContain) {
    assert(
      out.toLowerCase().includes(frag.toLowerCase()),
      `expected "${frag}" in restored output for "${input}" → got: ${out}`,
    );
  }
}

console.info("interpreter glossary verify: ok (%d cases)", cases.length);
