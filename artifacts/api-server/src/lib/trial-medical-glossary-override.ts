/**
 * trial-hetzner post-MT glossary override — 50 critical medical EN terms → AR / ES.
 * Runs after NLLB/Libre output; replaces Latin leaks with curated forms from glossary_medical.json
 * or the built-in fallback table when the JSON file is absent.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

type GlossaryEntry = {
  translations?: Record<string, string>;
};

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");

/** Built-in fallback when glossary_medical.json is not on disk (repo ships insurance only). */
const CRITICAL_MEDICAL_EN_TERMS: Record<string, { ar: string; es: string }> = {
  cardiomyopathy: { ar: "اعتلال عضلة القلب", es: "miocardiopatía" },
  "ischemic cardiomyopathy": { ar: "اعتلال عضلة القلب الإقفاري", es: "miocardiopatía isquémica" },
  dyslipidemia: { ar: "خلل شحميات الدم", es: "dislipidemia" },
  hyperlipidemia: { ar: "فرط شحميات الدم", es: "hiperlipidemia" },
  "hemoglobin a1c": { ar: "الهيموغلوبين الغليكوزيلي", es: "hemoglobina A1c" },
  hba1c: { ar: "الهيموغلوبين الغليكوزيلي", es: "hemoglobina A1c" },
  "glycosylated hemoglobin": { ar: "الهيموغلوبين الغليكوزيلي", es: "hemoglobina glicosilada" },
  egfr: { ar: "معدل الترشيح الكلوي المقدّر", es: "TFG estimada" },
  "estimated glomerular filtration rate": {
    ar: "معدل الترشيح الكلوي المقدّر",
    es: "tasa de filtración glomerular estimada",
  },
  creatinine: { ar: "الكرياتينين", es: "creatinina" },
  "congestive heart failure": { ar: "قصور القلب الاحتقاني", es: "insuficiencia cardíaca congestiva" },
  "heart failure": { ar: "قصور القلب", es: "insuficiencia cardíaca" },
  "hypertensive heart disease": { ar: "مرض القلب الضغطي", es: "cardiopatía hipertensiva" },
  hypertension: { ar: "ارتفاع ضغط الدم", es: "hipertensión" },
  diabetes: { ar: "داء السكري", es: "diabetes" },
  "type 2 diabetes": { ar: "داء السكري من النوع الثاني", es: "diabetes tipo 2" },
  echocardiogram: { ar: "رسم القلب بالموجات فوق الصوتية", es: "ecocardiograma" },
  "transthoracic echocardiogram": { ar: "تخطيط صدى القلب عبر الصدر", es: "ecocardiograma transtorácico" },
  angiography: { ar: "تصوير الأوعية", es: "angiografía" },
  "coronary angiography": { ar: "تصوير الأوعية التاجية", es: "angiografía coronaria" },
  holter: { ar: "هولتر", es: "Holter" },
  "holter monitoring": { ar: "مراقبة هولتر", es: "monitoreo Holter" },
  microalbumin: { ar: "الألبومين الجزيئي الدقيق", es: "microalbúmina" },
  "microvascular complications": { ar: "مضاعفات الأوعية الدقيقة", es: "complicaciones microvasculares" },
  "chronic kidney disease": { ar: "مرض الكلى المزمن", es: "enfermedad renal crónica" },
  "atrial fibrillation": { ar: "الرجفان الأذيني", es: "fibrilación auricular" },
  "myocardial infarction": { ar: "احتشاء عضلة القلب", es: "infarto de miocardio" },
  "coronary artery disease": { ar: "مرض الشريان التاجي", es: "enfermedad de las arterias coronarias" },
  stent: { ar: "دعامة", es: "stent" },
  catheterization: { ar: "قسطرة", es: "cateterismo" },
  biopsy: { ar: "خزعة", es: "biopsia" },
  colonoscopy: { ar: "تنظير القولون", es: "colonoscopia" },
  endoscopy: { ar: "تنظير داخلي", es: "endoscopia" },
  pneumonia: { ar: "ذات الرئة", es: "neumonía" },
  sepsis: { ar: "تسمم الدم", es: "sepsis" },
  stroke: { ar: "سكتة دماغية", es: "accidente cerebrovascular" },
  dialysis: { ar: "غسيل الكلى", es: "diálisis" },
  insulin: { ar: "الأنسولين", es: "insulina" },
  cholesterol: { ar: "الكوليسترول", es: "colesterol" },
  anemia: { ar: "فقر الدم", es: "anemia" },
  metastasis: { ar: "انتشار سرطاني", es: "metástasis" },
  oncology: { ar: "علم الأورام", es: "oncología" },
  chemotherapy: { ar: "العلاج الكيميائي", es: "quimioterapia" },
  "blood pressure": { ar: "ضغط الدم", es: "presión arterial" },
  "chest pain": { ar: "ألم في الصدر", es: "dolor torácico" },
  "shortness of breath": { ar: "ضيق في التنفس", es: "falta de aire" },
  dyspnea: { ar: "ضيق في التنفس", es: "disnea" },
  palpitations: { ar: "خفقان", es: "palpitaciones" },
  arrhythmia: { ar: "اضطراب نظم القلب", es: "arritmia" },
  tachycardia: { ar: "تسرع القلب", es: "taquicardia" },
};

let loadedFromJson = false;
let jsonTerms: Map<string, { ar?: string; es?: string }> | null = null;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadGlossaryMedicalJson(): Map<string, { ar?: string; es?: string }> {
  if (jsonTerms) return jsonTerms;
  jsonTerms = new Map();
  const file = path.join(DATA_DIR, "glossary_medical.json");
  if (!fs.existsSync(file)) {
    loadedFromJson = false;
    return jsonTerms;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as GlossaryEntry[];
    if (!Array.isArray(raw)) return jsonTerms;
    for (const entry of raw) {
      const en = entry.translations?.en?.trim();
      if (!en || en.length < 2) continue;
      jsonTerms.set(en.toLowerCase(), {
        ar: entry.translations?.ar?.trim(),
        es: entry.translations?.es?.trim(),
      });
    }
    loadedFromJson = true;
    logger.info({ count: jsonTerms.size }, "trial-medical-glossary: loaded glossary_medical.json");
  } catch (err) {
    logger.warn({ err }, "trial-medical-glossary: failed to read glossary_medical.json");
  }
  return jsonTerms;
}

function lookupReplacement(enTerm: string, tgtCode: string): string | null {
  const k = enTerm.toLowerCase();
  const fromJson = loadGlossaryMedicalJson().get(k);
  if (fromJson) {
    if (tgtCode === "ar" && fromJson.ar) return fromJson.ar;
    if (tgtCode === "es" && fromJson.es) return fromJson.es;
  }
  const fallback = CRITICAL_MEDICAL_EN_TERMS[k];
  if (!fallback) return null;
  if (tgtCode === "ar") return fallback.ar;
  if (tgtCode === "es") return fallback.es;
  return null;
}

/**
 * After MT: if Latin English medical term still appears in AR/ES output, force curated gloss.
 */
export function applyTrialMedicalGlossaryOverride(
  translated: string,
  srcCode: string,
  tgtCode: string,
): string {
  if (srcCode !== "en" || (tgtCode !== "ar" && tgtCode !== "es") || !translated.trim()) {
    return translated;
  }
  if (!/[A-Za-z]{3,}/.test(translated)) return translated;

  loadGlossaryMedicalJson();

  const terms = new Set<string>([
    ...Object.keys(CRITICAL_MEDICAL_EN_TERMS),
    ...[...loadGlossaryMedicalJson().keys()].slice(0, 200),
  ]);
  const sorted = [...terms].sort((a, b) => b.length - a.length);

  let out = translated;
  for (const en of sorted) {
    const repl = lookupReplacement(en, tgtCode);
    if (!repl) continue;
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(en)}(?![A-Za-z])`, "gi");
    if (re.test(out)) out = out.replace(re, () => repl);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export function trialMedicalGlossarySource(): "json" | "builtin" {
  loadGlossaryMedicalJson();
  return loadedFromJson ? "json" : "builtin";
}
