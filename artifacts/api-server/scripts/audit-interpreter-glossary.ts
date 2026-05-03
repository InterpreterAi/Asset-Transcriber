/**
 * Full audit of interpreter glossary JSON vs INTERPRETER_GLOSSARY_LANG_CODES.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/audit-interpreter-glossary.ts
 *   pnpm --filter @workspace/api-server exec tsx scripts/audit-interpreter-glossary.ts --json report.json
 *   pnpm --filter @workspace/api-server exec tsx scripts/audit-interpreter-glossary.ts --strict   # exit 1 if any gap
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rawTranslationGapsForEntry } from "../src/lib/interpreter-glossary.js";
import { INTERPRETER_GLOSSARY_LANG_CODES } from "../src/lib/interpreter-glossary.langs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const FILES = [
  "glossary_medical.json",
  "glossary_legal.json",
  "glossary_immigration.json",
  "glossary_insurance.json",
] as const;

type Row = {
  file: string;
  canonicalKey: string;
  category: string;
  missingLangs: string[];
  equalsEnglishLangs: string[];
};

function main() {
  const argv = process.argv.slice(2);
  const jsonIdx = argv.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
  const strict = argv.includes("--strict");

  const rows: Row[] = [];
  let totalMissing = 0;
  let totalEqualsEn = 0;
  let entriesWithAnyGap = 0;

  for (const fname of FILES) {
    const fp = path.join(DATA_DIR, fname);
    if (!fs.existsSync(fp)) {
      console.error("missing file:", fp);
      continue;
    }
    const rawFile = JSON.parse(fs.readFileSync(fp, "utf8")) as Record<
      string,
      { category?: string; translations?: Record<string, string> }
    >;
    for (const [canonicalKey, row] of Object.entries(rawFile)) {
      if (!row.translations || typeof row.translations !== "object") continue;
      const cat = row.category;
      if (!["medical", "legal", "immigration", "insurance"].includes(String(cat))) continue;

      const { missingLangs, equalsEnglishLangs } = rawTranslationGapsForEntry(canonicalKey, row.translations);
      if (missingLangs.length === 0 && equalsEnglishLangs.length === 0) continue;

      entriesWithAnyGap += 1;
      totalMissing += missingLangs.length;
      totalEqualsEn += equalsEnglishLangs.length;
      rows.push({
        file: fname,
        canonicalKey,
        category: String(cat),
        missingLangs: [...missingLangs],
        equalsEnglishLangs: [...equalsEnglishLangs],
      });
    }
  }

  const summary = {
    languagesExpected: INTERPRETER_GLOSSARY_LANG_CODES.length,
    glossaryFiles: FILES.length,
    entriesWithAnyGap,
    missingLanguageCells: totalMissing,
    equalsEnglishCells: totalEqualsEn,
    totalGapCells: totalMissing + totalEqualsEn,
  };

  console.info("interpreter glossary audit", summary);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({ summary, rows }, null, 2), "utf8");
    console.info("wrote", jsonOut);
  }

  if (strict && summary.totalGapCells > 0) {
    process.exit(1);
  }
}

main();
