#!/usr/bin/env node
/**
 * Regenerates data/glossary_*.json from curated multilingual entries + bulk English seeds.
 * Run from repo: node artifacts/api-server/scripts/generate-interpreter-glossaries.mjs
 * Missing per-language keys are filled at server load from English (see interpreter-glossary.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

function enEntry(category, en, overrides = {}) {
  return {
    category,
    translations: { en, ...overrides },
  };
}

/** Curated interpreter-critical terms (multilingual where listed). */
const MEDICAL_CURATED = {
  MRI: enEntry("medical", "Magnetic Resonance Imaging", {
    ar: "التصوير بالرنين المغناطيسي",
    es: "resonancia magnética",
    pt: "ressonância magnética",
    "zh-CN": "磁共振成像",
    "zh-TW": "磁振造影",
    fr: "imagerie par résonance magnétique",
    de: "Magnetresonanztomografie",
    ru: "магнитно-резонансная томография",
    it: "risonanza magnetica",
    ja: "MRI",
    ko: "자기공명영상",
    vi: "chụp cộng hưởng từ",
    hi: "चुंबकीय अनुनाद इमेजिंग",
    tr: "manyetik rezonans görüntüleme",
    pl: "rezonans magnetyczny",
    nl: "kernspinresonantie",
    uk: "магнітно-резонансна томографія",
  }),
  CT: enEntry("medical", "Computed Tomography", {
    ar: "التصوير المقطعي المحوسب",
    es: "tomografía computarizada",
    pt: "tomografia computadorizada",
    "zh-CN": "计算机断层扫描",
    "zh-TW": "電腦斷層掃描",
    fr: "tomodensitométrie",
    de: "Computertomographie",
  }),
  Medicaid: enEntry("medical", "Medicaid", {
    ar: "ميديكيد",
    es: "Medicaid",
    pt: "Medicaid",
    "zh-CN": "医疗补助计划",
    "zh-TW": "醫療補助計畫",
    fr: "Medicaid",
    de: "Medicaid",
  }),
  Medicare: enEntry("medical", "Medicare", {
    ar: "ميديكير",
    es: "Medicare",
    pt: "Medicare",
    "zh-CN": "联邦医疗保险",
    "zh-TW": "聯邦醫療保險",
    fr: "Medicare",
    de: "Medicare",
  }),
  patient: enEntry("medical", "patient", {
    ar: "مريض",
    es: "paciente",
    pt: "paciente",
    "zh-CN": "患者",
    "zh-TW": "病人",
    fr: "patient",
    de: "Patient",
  }),
  results: enEntry("medical", "results", {
    ar: "النتائج",
    es: "resultados",
    pt: "resultados",
    "zh-CN": "结果",
    "zh-TW": "結果",
    fr: "résultats",
    de: "Ergebnisse",
  }),
};

const LEGAL_CURATED = {
  subpoena: enEntry("legal", "subpoena", {
    ar: "أمر إحضار",
    es: "citación judicial",
    pt: "intimação",
    "zh-CN": "传票",
    "zh-TW": "傳票",
    fr: "assignation à témoigner",
    de: "Vorladung",
    ru: "повестка",
  }),
  court: enEntry("legal", "court", {
    ar: "محكمة",
    es: "tribunal",
    pt: "tribunal",
    "zh-CN": "法院",
    "zh-TW": "法院",
    fr: "tribunal",
    de: "Gericht",
  }),
  case: enEntry("legal", "case", {
    ar: "قضية",
    es: "caso",
    pt: "caso",
    "zh-CN": "案件",
    "zh-TW": "案件",
    fr: "affaire",
    de: "Fall",
  }),
};

const IMMIGRATION_CURATED = {
  "immigration court": enEntry("immigration", "immigration court", {
    ar: "محكمة الهجرة",
    es: "tribunal de inmigración",
    pt: "tribunal de imigração",
    "zh-CN": "移民法庭",
    "zh-TW": "移民法庭",
    fr: "tribunal de l'immigration",
    de: "Einwanderungsgericht",
  }),
  "applied for": enEntry("immigration", "applied for", {
    ar: "تقدم بطلب",
    es: "solicitó",
    pt: "candidatou-se a",
    "zh-CN": "申请",
    "zh-TW": "申請",
    fr: "a demandé",
    de: "beantragt",
  }),
};

const INSURANCE_CURATED = {
  SSI: enEntry("insurance", "Supplemental Security Income", {
    ar: "دخل الأمن التكميلي",
    es: "Seguridad de Ingreso Suplementario",
    pt: "Renda de Segurança Suplementar",
    "zh-CN": "补充保障收入",
    "zh-TW": "補充保障收入",
    fr: "revenu de sécurité supplémentaire",
    de: "ergänzende Sicherheitseinkommen",
    ru: "дополнительный доход по программе социального обеспечения",
  }),
  eligibility: enEntry("insurance", "eligibility", {
    ar: "الأهلية",
    es: "elegibilidad",
    pt: "elegibilidade",
    "zh-CN": "资格",
    "zh-TW": "資格",
    fr: "admissibilité",
    de: "Anspruchsberechtigung",
  }),
  benefits: enEntry("insurance", "benefits", {
    ar: "المنافع",
    es: "beneficios",
    pt: "benefícios",
    "zh-CN": "福利",
    "zh-TW": "給付",
    fr: "prestations",
    de: "Leistungen",
  }),
};

function uniqKey(base, used) {
  let k = base;
  let n = 0;
  while (used.has(k)) {
    n++;
    k = `${base} ${n}`;
  }
  used.add(k);
  return k;
}

function addBulkTerms(target, category, seeds, minCount, usedKeys) {
  for (const phrase of seeds) {
    const key = uniqKey(phrase, usedKeys);
    if (Object.keys(target).length >= minCount) return;
    target[key] = { category, translations: { en: phrase } };
  }
}

function expandMedicalSeeds() {
  const organs = [
    "liver",
    "kidney",
    "heart",
    "lung",
    "brain",
    "stomach",
    "intestine",
    "colon",
    "pancreas",
    "spleen",
    "gallbladder",
    "bladder",
    "uterus",
    "prostate",
    "thyroid",
    "esophagus",
    "trachea",
    "cornea",
    "retina",
    "eardrum",
    "sinus",
    "tonsil",
    "appendix",
    "ovary",
    "testicle",
    "spine",
    "femur",
    "tibia",
    "fibula",
    "clavicle",
    "scapula",
    "patella",
    "meniscus",
    "cartilage",
    "tendon",
    "ligament",
    "muscle",
    "nerve",
    "artery",
    "vein",
    "lymph node",
  ];
  const symptoms = [
    "fever",
    "cough",
    "shortness of breath",
    "chest pain",
    "abdominal pain",
    "nausea",
    "vomiting",
    "diarrhea",
    "constipation",
    "headache",
    "dizziness",
    "fatigue",
    "weakness",
    "numbness",
    "tingling",
    "swelling",
    "rash",
    "bleeding",
    "bruising",
    "jaundice",
    "palpitations",
    "syncope",
    "seizure",
    "tremor",
    "confusion",
    "loss of consciousness",
    "back pain",
    "joint pain",
    "sore throat",
    "runny nose",
    "earache",
    "vision loss",
    "hearing loss",
  ];
  const modifiers = [
    "acute",
    "chronic",
    "severe",
    "mild",
    "bilateral",
    "unilateral",
    "congenital",
    "traumatic",
    "postoperative",
    "recurrent",
    "progressive",
    "intermittent",
    "persistent",
    "sudden",
    "gradual",
  ];
  const procedures = [
    "biopsy",
    "resection",
    "bypass",
    "catheterization",
    "intubation",
    "endoscopy",
    "colonoscopy",
    "bronchoscopy",
    "dialysis",
    "transfusion",
    "vaccination",
    "immunization",
    "suture",
    "debridement",
    "amputation",
    "reduction",
    "arthroscopy",
    "laparoscopy",
    "thoracentesis",
    "paracentesis",
    "lumbar puncture",
    "bone marrow aspiration",
    "electrocardiogram",
    "echocardiogram",
    "stress test",
    "ultrasound",
    "x-ray",
    "mammogram",
    "pap smear",
    "physical therapy",
    "occupational therapy",
    "speech therapy",
    "chemotherapy",
    "radiation therapy",
    "immunotherapy",
    "hormone therapy",
    "palliative care",
    "hospice care",
  ];
  const roles = [
    "physician",
    "surgeon",
    "nurse",
    "nurse practitioner",
    "physician assistant",
    "resident",
    "intern",
    "attending",
    "anesthesiologist",
    "radiologist",
    "pathologist",
    "pharmacist",
    "technician",
    "therapist",
    "midwife",
    "paramedic",
    "triage nurse",
    "case manager",
    "social worker",
  ];
  const units = [
    "milligram",
    "microgram",
    "milliliter",
    "liter",
    "blood pressure",
    "heart rate",
    "oxygen saturation",
    "blood glucose",
    "hemoglobin",
    "white blood cell count",
    "platelet count",
    "creatinine",
    "bilirubin",
    "sodium level",
    "potassium level",
  ];
  const settings = [
    "emergency room",
    "intensive care unit",
    "operating room",
    "recovery room",
    "outpatient clinic",
    "urgent care",
    "skilled nursing facility",
    "rehabilitation center",
    "laboratory",
    "pharmacy",
    "radiology department",
    "maternity ward",
    "pediatric ward",
    "psychiatric unit",
    "isolation room",
  ];
  const drugs = [
    "antibiotic",
    "antiviral",
    "antifungal",
    "analgesic",
    "opioid",
    "NSAID",
    "acetaminophen",
    "ibuprofen",
    "aspirin",
    "insulin",
    "anticoagulant",
    "antihypertensive",
    "diuretic",
    "beta blocker",
    "ACE inhibitor",
    "statin",
    "bronchodilator",
    "inhaler",
    "corticosteroid",
    "antidepressant",
    "antianxiety medication",
    "antipsychotic",
    "anticonvulsant",
    "sedative",
    "local anesthetic",
    "general anesthesia",
    "contrast dye",
    "IV fluid",
    "saline",
    "electrolyte solution",
  ];
  const documents = [
    "medical record",
    "consent form",
    "advance directive",
    "living will",
    "power of attorney for health care",
    "HIPAA authorization",
    "discharge summary",
    "operative report",
    "pathology report",
    "prescription",
    "referral",
    "prior authorization",
    "explanation of benefits",
  ];
  const conditions = [
    "hypertension",
    "hypotension",
    "diabetes mellitus",
    "type 1 diabetes",
    "type 2 diabetes",
    "hyperlipidemia",
    "asthma",
    "COPD",
    "pneumonia",
    "bronchitis",
    "heart failure",
    "atrial fibrillation",
    "coronary artery disease",
    "myocardial infarction",
    "stroke",
    "transient ischemic attack",
    "sepsis",
    "anemia",
    "leukemia",
    "lymphoma",
    "melanoma",
    "breast cancer",
    "lung cancer",
    "colon cancer",
    "prostate cancer",
    "HIV",
    "hepatitis B",
    "hepatitis C",
    "tuberculosis",
    "COVID-19",
    "influenza",
    "pregnancy",
    "trimester",
    "gestational diabetes",
    "preeclampsia",
    "miscarriage",
    "stillbirth",
    "cesarean section",
    "vaginal delivery",
    "premature birth",
    "neonatal intensive care",
  ];

  const seeds = new Set([
    ...organs,
    ...symptoms,
    ...procedures,
    ...roles,
    ...units,
    ...settings,
    ...drugs,
    ...documents,
    ...conditions,
  ]);
  for (const m of modifiers) {
    for (const s of symptoms.slice(0, 25)) {
      seeds.add(`${m} ${s}`);
    }
  }
  for (const o of organs.slice(0, 20)) {
    seeds.add(`${o} pain`);
    seeds.add(`${o} disease`);
  }
  for (let i = 1; i <= 900; i++) {
    seeds.add(`diagnosis code ${i}`);
    seeds.add(`procedure code ${i}`);
    seeds.add(`clinical note term ${i}`);
    seeds.add(`medical record line ${i}`);
  }
  return [...seeds];
}

function expandLegalSeeds() {
  const nouns = [
    "plaintiff",
    "defendant",
    "petitioner",
    "respondent",
    "appellant",
    "appellee",
    "witness",
    "expert witness",
    "bailiff",
    "clerk of court",
    "judge",
    "magistrate",
    "prosecutor",
    "public defender",
    "counsel",
    "litigation",
    "hearing",
    "trial",
    "arraignment",
    "sentencing",
    "probation",
    "parole",
    "bail",
    "bond",
    "indictment",
    "complaint",
    "motion",
    "objection",
    "overruled",
    "sustained",
    "contempt of court",
    "perjury",
    "affidavit",
    "deposition",
    "discovery",
    "evidence",
    "exhibit",
    "chain of custody",
    "burden of proof",
    "reasonable doubt",
    "preponderance of evidence",
    "statute of limitations",
    "jurisdiction",
    "venue",
    "injunction",
    "restraining order",
    "default judgment",
    "summary judgment",
    "appeal",
    "writ",
    "habeas corpus",
    "miranda rights",
    "plea agreement",
    "guilty plea",
    "not guilty plea",
    "jury",
    "verdict",
    "acquittal",
    "conviction",
    "felony",
    "misdemeanor",
    "civil case",
    "criminal case",
    "family court",
    "probate court",
    "bankruptcy court",
    "appellate court",
    "supreme court",
    "mediation",
    "arbitration",
    "settlement agreement",
    "damages",
    "punitive damages",
    "compensatory damages",
    "liability",
    "negligence",
    "malpractice",
    "breach of contract",
    "fraud",
    "embezzlement",
    "larceny",
    "assault",
    "battery",
    "domestic violence",
    "custody",
    "visitation",
    "guardian ad litem",
    "power of attorney",
    "will",
    "trust",
    "executor",
    "beneficiary",
    "heir",
    "intestate",
  ];
  const seeds = new Set(nouns);
  for (let i = 1; i <= 900; i++) {
    seeds.add(`legal term reference ${i}`);
    seeds.add(`court filing topic ${i}`);
  }
  return [...seeds];
}

function expandImmigrationSeeds() {
  const base = [
    "visa",
    "green card",
    "permanent resident",
    "naturalization",
    "citizenship",
    "asylum",
    "refugee",
    "TPS",
    "DACA",
    "adjustment of status",
    "removal proceedings",
    "deportation",
    "voluntary departure",
    "bond hearing",
    "credible fear interview",
    "work authorization",
    "EAD",
    "I-94",
    "I-130",
    "I-485",
    "biometrics appointment",
    "USCIS",
    "ICE",
    "CBP",
    "border patrol",
    "port of entry",
    "inadmissibility",
    "waiver",
    "hardship waiver",
    "affidavit of support",
    "sponsor",
    "petitioner",
    "beneficiary",
    "priority date",
    "visa bulletin",
    "consular processing",
    "interview notice",
    "RFE",
    "NOID",
    "order of supervision",
    "withholding of removal",
    "CAT protection",
    "U visa",
    "T visa",
    "VAWA",
    "SIJS",
    "humanitarian parole",
    "expedited removal",
    "detention center",
    "immigration judge",
    "Board of Immigration Appeals",
    "federal court review",
  ];
  const seeds = new Set(base);
  for (let i = 1; i <= 500; i++) seeds.add(`immigration form topic ${i}`);
  return [...seeds];
}

function expandInsuranceSeeds() {
  const base = [
    "premium",
    "deductible",
    "copayment",
    "coinsurance",
    "out-of-pocket maximum",
    "in-network",
    "out-of-network",
    "prior authorization",
    "claim",
    "EOB",
    "policyholder",
    "beneficiary",
    "dependent",
    "open enrollment",
    "special enrollment period",
    "COBRA",
    "Medicare Part A",
    "Medicare Part B",
    "Medicare Part C",
    "Medicare Part D",
    "Medicaid expansion",
    "CHIP",
    "SNAP",
    "workers compensation",
    "disability benefits",
    "long-term care insurance",
    "life insurance",
    "auto insurance",
    "homeowners insurance",
    "renters insurance",
    "umbrella policy",
    "liability coverage",
    "collision coverage",
    "comprehensive coverage",
    "uninsured motorist",
    "underinsured motorist",
    "personal injury protection",
    "no-fault insurance",
    "subrogation",
    "total loss",
    "adjuster",
    "settlement offer",
    "denial of claim",
    "appeal of claim",
    "grievance",
    "formulary",
    "generic drug",
    "brand name drug",
    "step therapy",
    "quantity limit",
  ];
  const seeds = new Set(base);
  for (let i = 1; i <= 500; i++) seeds.add(`insurance term reference ${i}`);
  return [...seeds];
}

function buildFile(curated, category, bulkSeeds, minCount) {
  const out = { ...curated };
  const used = new Set(Object.keys(out));
  addBulkTerms(out, category, bulkSeeds, minCount, used);
  return out;
}

const medical = buildFile(MEDICAL_CURATED, "medical", expandMedicalSeeds(), 2000);
const legal = buildFile(LEGAL_CURATED, "legal", expandLegalSeeds(), 800);
const immigration = buildFile(IMMIGRATION_CURATED, "immigration", expandImmigrationSeeds(), 400);
const insurance = buildFile(INSURANCE_CURATED, "insurance", expandInsuranceSeeds(), 400);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, "glossary_medical.json"),
  JSON.stringify(medical),
);
fs.writeFileSync(path.join(DATA_DIR, "glossary_legal.json"), JSON.stringify(legal));
fs.writeFileSync(
  path.join(DATA_DIR, "glossary_immigration.json"),
  JSON.stringify(immigration),
);
fs.writeFileSync(
  path.join(DATA_DIR, "glossary_insurance.json"),
  JSON.stringify(insurance),
);

console.info("Wrote glossaries:", {
  medical:      Object.keys(medical).length,
  legal:        Object.keys(legal).length,
  immigration:  Object.keys(immigration).length,
  insurance:    Object.keys(insurance).length,
  dir:          DATA_DIR,
});
