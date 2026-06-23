#!/usr/bin/env node
/**
 * Regenerate docs/LANGUAGE-CATALOG-REPORT.md from the shared workspace catalog
 * and interpreter glossary audit stats.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/language-catalog-report.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WORKSPACE_LANGUAGES,
  WORKSPACE_LANGUAGE_COUNT,
  workspaceLanguageCodes,
} from "../../transcription-app/src/lib/workspace-languages.js";
import { INTERPRETER_GLOSSARY_LANG_CODES } from "../src/lib/interpreter-glossary.langs.js";
import { rawTranslationGapsForEntry } from "../src/lib/interpreter-glossary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DATA_DIR = path.resolve(__dirname, "..", "data");
const REPORT_PATH = path.join(REPO_ROOT, "docs/LANGUAGE-CATALOG-REPORT.md");

const GLOSSARY_FILES = [
  "glossary_medical.json",
  "glossary_legal.json",
  "glossary_immigration.json",
  "glossary_insurance.json",
] as const;

/** Phase A Soniox additions (26 codes). */
const PHASE_A_ADDITIONS = [
  "af", "sq", "az", "eu", "be", "bn", "bs", "ca", "et", "gl", "gu", "kn", "kk",
  "lv", "lt", "mk", "ml", "mr", "pa", "sr", "sl", "sw", "tl", "ta", "te", "cy",
] as const;

/** Hetzner paid deploy LT_LOAD_ONLY (Phase B audit). */
const HETZNER_MT_LOADED = [
  "en", "es", "fr", "de", "it", "pt", "ru", "ar", "zh", "hi", "tr", "pl", "nl",
] as const;

function auditGlossary() {
  const missingByLang: Record<string, number> = {};
  const equalsEnByLang: Record<string, number> = {};
  let entriesWithAnyGap = 0;
  let totalMissing = 0;
  let totalEqualsEn = 0;

  for (const fname of GLOSSARY_FILES) {
    const fp = path.join(DATA_DIR, fname);
    if (!fs.existsSync(fp)) continue;
    const rawFile = JSON.parse(fs.readFileSync(fp, "utf8")) as Record<
      string,
      { category?: string; translations?: Record<string, string> }
    >;
    for (const [canonicalKey, row] of Object.entries(rawFile)) {
      if (!row.translations || typeof row.translations !== "object") continue;
      const cat = row.category;
      if (!["medical", "legal", "immigration", "insurance"].includes(String(cat))) continue;

      const { missingLangs, equalsEnglishLangs } = rawTranslationGapsForEntry(
        canonicalKey,
        row.translations,
      );
      if (missingLangs.length === 0 && equalsEnglishLangs.length === 0) continue;

      entriesWithAnyGap += 1;
      for (const c of missingLangs) {
        missingByLang[c] = (missingByLang[c] ?? 0) + 1;
        totalMissing += 1;
      }
      for (const c of equalsEnglishLangs) {
        equalsEnByLang[c] = (equalsEnByLang[c] ?? 0) + 1;
        totalEqualsEn += 1;
      }
    }
  }

  return {
    entriesWithAnyGap,
    totalMissing,
    totalEqualsEn,
    missingByLang,
    equalsEnByLang,
  };
}

function main() {
  const audit = auditGlossary();
  const workspaceCodes = new Set(workspaceLanguageCodes());
  const glossaryCodes = new Set(INTERPRETER_GLOSSARY_LANG_CODES);

  const inWorkspaceNotGlossary = [...workspaceCodes].filter((c) => !glossaryCodes.has(c));
  const inGlossaryNotWorkspace = [...glossaryCodes].filter((c) => !workspaceCodes.has(c));

  const langsWithJsonCells = INTERPRETER_GLOSSARY_LANG_CODES.filter(
    (c) => c !== "en" && (audit.missingByLang[c] ?? 0) < 3601,
  );
  const langsFullFallback = PHASE_A_ADDITIONS.filter(
    (c) => (audit.missingByLang[c] ?? 0) >= 3601,
  );
  const langsNeedingMtVerification = WORKSPACE_LANGUAGES.map((l) => l.value).filter(
    (c) => !HETZNER_MT_LOADED.includes(c as (typeof HETZNER_MT_LOADED)[number]),
  );

  const generated = new Date().toISOString().slice(0, 10);

  const lines = [
    "# Language catalog report",
    "",
    `Generated: ${generated} via \`pnpm --filter @workspace/api-server exec tsx scripts/language-catalog-report.ts\``,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "|--------|------:|",
    `| Workspace languages (STT pickers) | ${WORKSPACE_LANGUAGE_COUNT} |`,
    `| Glossary languages (\`INTERPRETER_GLOSSARY_LANG_CODES\`) | ${INTERPRETER_GLOSSARY_LANG_CODES.length} |`,
    `| Glossary JSON entries (all domains) | 3,601 |`,
    `| Glossary entries with any JSON gap | ${audit.entriesWithAnyGap} |`,
    `| Missing translation cells (JSON) | ${audit.totalMissing.toLocaleString()} |`,
    `| Equals-English cells (JSON) | ${audit.totalEqualsEn.toLocaleString()} |`,
    "",
    "## Phase A additions (26 languages)",
    "",
    PHASE_A_ADDITIONS.map((c) => {
      const label = WORKSPACE_LANGUAGES.find((l) => l.value === c)?.label ?? c;
      return `- \`${c}\` — ${label}`;
    }).join("\n"),
    "",
    "## Glossary coverage",
    "",
    "At **server load**, every glossary term materializes all 62 language slots; missing JSON keys fall back to the English gloss (`translations.en`). Existing curated translations for medical, legal, immigration, and insurance terms are unchanged.",
    "",
    "### Languages with partial JSON coverage (legacy 36 stack)",
    "",
    langsWithJsonCells.length
      ? langsWithJsonCells.map((c) => `- \`${c}\``).join("\n")
      : "_None_",
    "",
    "### Languages using full English fallback in JSON (Phase A additions)",
    "",
    langsFullFallback.map((c) => {
      const label = WORKSPACE_LANGUAGES.find((l) => l.value === c)?.label ?? c;
      return `- \`${c}\` — ${label} (${audit.missingByLang[c] ?? 0} missing cells)`;
    }).join("\n"),
    "",
    "### Missing cells by language (top gaps)",
    "",
    "| Code | Label | Missing cells | Equals-English |",
    "|------|-------|--------------:|---------------:|",
    ...INTERPRETER_GLOSSARY_LANG_CODES.filter((c) => c !== "en")
      .map((c) => ({
        c,
        label: WORKSPACE_LANGUAGES.find((l) => l.value === c)?.label ?? c,
        missing: audit.missingByLang[c] ?? 0,
        eq: audit.equalsEnByLang[c] ?? 0,
      }))
      .sort((a, b) => b.missing - a.missing)
      .map((r) => `| \`${r.c}\` | ${r.label} | ${r.missing.toLocaleString()} | ${r.eq.toLocaleString()} |`),
    "",
    "## Machine translation verification (Phase B baseline)",
    "",
    "These lists are **informational** — translation routing was not changed in Phase C–F.",
    "",
    `- **Hetzner paid stack (\`LT_LOAD_ONLY\`)**: ${HETZNER_MT_LOADED.length} languages — ${HETZNER_MT_LOADED.join(", ")}`,
    `- **OpenAI / Platinum**: effectively all ${WORKSPACE_LANGUAGE_COUNT} workspace codes`,
    `- **Languages requiring future MT verification on Hetzner/Libre path**: ${langsNeedingMtVerification.length} of ${WORKSPACE_LANGUAGE_COUNT}`,
    "",
    "## Catalog consistency checks",
    "",
    `- Workspace ⊄ glossary: ${inWorkspaceNotGlossary.length ? inWorkspaceNotGlossary.join(", ") : "none"}`,
    `- Glossary ⊄ workspace: ${inGlossaryNotWorkspace.length ? inGlossaryNotWorkspace.join(", ") : "none"}`,
    "",
    "## Regenerate full gap detail",
    "",
    "```bash",
    "pnpm --filter @workspace/api-server glossary:audit",
    "pnpm --filter @workspace/api-server glossary:audit -- --json /tmp/glossary-audit.json",
    "```",
    "",
  ];

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.info("wrote", REPORT_PATH);
}

main();
