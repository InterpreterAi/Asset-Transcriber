/**
 * One-shot: parse the interpreter en-pl list into interpreter-glossary.json.
 * Run: node src/experiments/trial-soniox-x/_build-en-pl-glossary.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const rawPath = path.join(dir, "_en-pl-medical-raw.txt");
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

function primaryPl(value) {
  const parts = value
    .split(/\s*\/\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const candidates = [];
  for (const part of parts) {
    const abbrInner = /^[A-Za-z0-9&+.-]{1,12}\s*\((.+)\)$/.exec(part);
    if (abbrInner?.[1]) {
      candidates.push(abbrInner[1].trim());
      continue;
    }
    candidates.push(
      part
        .replace(/\s*\([A-Za-z0-9&+.-]{1,12}\)\s*$/g, "")
        .trim(),
    );
  }
  const ranked = [...new Set(candidates.filter(Boolean))].sort((a, b) => b.length - a.length);
  return ranked[0] ?? "";
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

const seen = new Map();
const rows = [];

for (const line of raw.split(/\n/)) {
  if (!line.includes("|")) continue;
  if (/^\s*\d+\.\s+/.test(line)) continue;
  const idx = line.indexOf("|");
  const enRaw = line.slice(0, idx);
  const plRaw = line.slice(idx + 1);
  const pl = primaryPl(plRaw);
  if (!pl) continue;

  for (const en of expandEnglish(enRaw)) {
    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { en, pl });
    rows.push({ en, pl });
  }

  const plAbbr = [...plRaw.matchAll(/\b([A-Z]{2,8})\b/g)].map((m) => m[1]);
  for (const abbr of plAbbr) {
    if (abbr === "OR" || seen.has(abbr.toLowerCase())) continue;
    seen.set(abbr.toLowerCase(), { en: abbr, pl });
    rows.push({ en: abbr, pl });
  }
}

const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
existing.pairs["en-pl"] = rows;
fs.writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);
console.log(`en-pl rows: ${rows.length} unique-ish entries`);
