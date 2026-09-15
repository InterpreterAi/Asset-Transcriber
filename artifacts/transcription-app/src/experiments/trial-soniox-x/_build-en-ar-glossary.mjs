/**
 * One-shot: parse the interpreter en-ar list into interpreter-glossary.json.
 * Run: node src/experiments/trial-soniox-x/_build-en-ar-glossary.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const rawPath = path.join(dir, "_en-ar-medical-raw.txt");
const outPath = path.join(dir, "interpreter-glossary.json");

const raw = fs.readFileSync(rawPath, "utf8");

function cleanEn(value) {
  let s = value.replace(/\s+/g, " ").trim();
  s = s.replace(/\u2019/g, "'");
  s = s.replace(/^(\d+)(st|nd|rd|th)\s+/i, "$1st ");
  s = s.replace(/^(.+?),\s*to\b/i, "to $1");
  s = s.replace(/,\s*to be$/i, "");
  s = s.replace(/Rashe\(s\)/i, "Rash");
  return s.trim();
}

function primaryAr(value) {
  const parts = value
    .split(/\s*\/\s*/)
    .map((part) =>
      part
        .replace(/\s+/g, " ")
        .replace(/\s*\([A-Za-z0-9&+.-]{1,12}\)\s*$/g, "")
        .trim(),
    )
    .filter(Boolean);
  if (parts.length === 0) return "";
  return [...parts].sort((a, b) => b.length - a.length)[0];
}

function expandEnglish(en) {
  const out = new Set();
  const base = cleanEn(en);
  if (!base) return [];
  const paren = [...base.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  const withoutParen = cleanEn(base.replace(/\s*\([^)]+\)/g, " "));
  if (withoutParen) out.add(withoutParen);
  if (!paren.length) out.add(base);

  for (const inner of paren) {
    if (/^to\s/i.test(inner)) continue;
    if (/^[A-Za-z0-9][A-Za-z0-9+.&\/-]{0,14}$/.test(inner) || /^(three-in-one shot|baby shot|baby blues)$/i.test(inner)) {
      out.add(inner);
    } else if (inner.length > 3 && inner.length < 80) {
      out.add(cleanEn(inner));
    }
  }

  for (const piece of withoutParen.split(/\s*\/\s*/)) {
    const p = cleanEn(piece);
    if (p && p.length > 1) out.add(p);
  }

  if (/,/.test(withoutParen) && !/^to /i.test(withoutParen)) {
    for (const piece of withoutParen.split(/,\s*/)) {
      const p = cleanEn(piece);
      if (p.length >= 5 && !/^(period|delivery)$/i.test(p)) out.add(p);
    }
  }

  // "CBC complete blood count" / "MRI Magnetic Resonance Imaging"
  const leadAbbr = /^([A-Z]{2,8}|[A-Z]&[A-Z])\s+(.+)$/.exec(withoutParen);
  if (leadAbbr) {
    out.add(leadAbbr[1]);
    out.add(cleanEn(leadAbbr[2]));
  }

  const dashAbbr = /^([A-Z]{2,8})\s*-\s*(.+)$/.exec(withoutParen);
  if (dashAbbr) {
    out.add(dashAbbr[1]);
    out.add(cleanEn(dashAbbr[2]));
  }

  return [...out].filter(Boolean);
}

const seen = new Map(); // enLower -> { en, ar }
const rows = [];

for (const line of raw.split(/\n/)) {
  if (!line.includes("|")) continue;
  if (/^\s*\d+\.\s+/.test(line)) continue;
  const idx = line.indexOf("|");
  const enRaw = line.slice(0, idx);
  const arRaw = line.slice(idx + 1);
  const ar = primaryAr(arRaw);
  if (!ar) continue;

  for (const en of expandEnglish(enRaw)) {
    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { en, ar });
    rows.push({ en, ar });
  }
}

const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
existing.pairs["en-ar"] = rows;
fs.writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);
console.log(`en-ar rows: ${rows.length} unique-ish entries`);
