/**
 * interpreter-context.ts
 * Builds the Soniox `context` payload for interpreter sessions.
 *
 * Tight budget (~6k chars operating / 10k hard max). Priority pins:
 * personal glossary → critical medical → critical claim/auto/body → vaccines.
 * Large body/insurance dumps were removed so high-stakes terms actually stick.
 */

import {
  CRITICAL_MEDICAL_EN_SET,
  criticalMedicalTermsForLang,
} from "../utils/critical-medical-terms";
import {
  CRITICAL_CLAIM_EN_SET,
  criticalClaimTermsForLang,
} from "../utils/critical-claim-terms";
import { buildChunkV2MedicalPackContext } from "./chunk-v2-medical-term-pack";
import {
  fitSonioxContextToBudget,
  SONIOX_CONTEXT_SAFE_CHARS,
  sonioxContextCharLength,
} from "./soniox-context-budget";

export type SonioxContextTerm = { source: string; target: string };

export type SonioxContext = {
  general: { key: string; value: string }[];
  terms: string[];
  translation_terms?: SonioxContextTerm[];
  /** Intentionally unused — do not send prior-transcript / session memory as context.text. */
  text?: never;
};

const MEDICAL_TERMS_EN: string[] = [
  "stroke", "seizure", "hypertension", "diabetes", "hypoglycemia",
  "hyperglycemia", "tachycardia", "bradycardia", "arrhythmia", "angina",
  "myocardial infarction", "pulmonary embolism", "deep vein thrombosis",
  "aneurysm", "sepsis", "pneumonia", "bronchitis", "asthma", "COPD",
  "appendicitis", "peritonitis", "pancreatitis", "cholecystitis",
  "hepatitis", "cirrhosis", "nephritis", "dialysis", "anemia",
  "leukemia", "lymphoma", "chemotherapy", "radiation therapy", "biopsy",
  "metastasis", "benign", "malignant", "carcinoma", "sarcoma",
  "fracture", "dislocation", "laceration", "contusion", "concussion",
  "dementia", "Alzheimer's", "Parkinson's", "multiple sclerosis",
  "epilepsy", "migraine", "vertigo", "tinnitus", "glaucoma", "cataract",
  "MRI", "CT scan", "X-ray", "ultrasound", "echocardiogram", "EKG", "ECG",
  "colonoscopy", "endoscopy", "laparoscopy", "intubation", "CPR",
  "defibrillation", "anesthesia", "angioplasty", "catheterization",
  "lumbar puncture", "sutures", "transfusion", "vaccination",
  "antibiotic", "antiviral", "anticoagulant", "antihistamine",
  "analgesic", "acetaminophen", "ibuprofen", "amoxicillin", "penicillin",
  "metformin", "insulin", "lisinopril", "atorvastatin", "warfarin",
  "heparin", "aspirin", "nitroglycerin", "morphine", "opioid",
  "benzodiazepine", "antidepressant", "antipsychotic",
  "diagnosis", "prognosis", "dosage", "prescription", "referral",
  "triage", "ICU", "emergency", "ambulatory", "inpatient", "outpatient",
  "informed consent", "advance directive", "DNR", "palliative",
  "physical therapy", "occupational therapy", "rehabilitation",
  "blood pressure", "heart rate", "oxygen saturation", "temperature",
  "CBC", "BMP", "urinalysis", "blood glucose", "cholesterol",
  "contraindication", "side effect", "allergy", "adverse reaction",
  "medical power of attorney", "HIPAA", "malpractice", "liability",
];

const LEGAL_TERMS_EN: string[] = [
  "plaintiff", "defendant", "testimony", "subpoena", "deposition",
  "affidavit", "jurisdiction", "indictment", "prosecution", "defense attorney",
  "verdict", "injunction", "restraining order", "bail", "parole",
  "probation", "felony", "misdemeanor", "statute", "ordinance",
  "due process", "habeas corpus", "Miranda rights", "plea bargain",
  "arraignment", "preliminary hearing", "grand jury", "cross-examination",
  "objection", "sustained", "overruled", "contempt of court",
  "perjury", "evidence", "exhibit", "hearsay", "circumstantial",
  "reasonable doubt", "burden of proof", "acquittal", "conviction",
  "sentence", "appeal", "class action", "settlement", "damages",
  "negligence", "liability", "breach of contract", "intellectual property",
  "copyright", "trademark", "patent", "asylum", "deportation",
  "immigration", "visa", "citizenship", "naturalization", "green card",
  "custody", "alimony", "guardian", "power of attorney", "notary",
];

type TermMap = Record<string, SonioxContextTerm[]>;

const TERMS_BY_LANG: TermMap = {
  es: [
    { source: "stroke", target: "ictus" },
    { source: "seizure", target: "convulsión" },
    { source: "hypertension", target: "hipertensión" },
    { source: "diabetes", target: "diabetes" },
    { source: "myocardial infarction", target: "infarto de miocardio" },
    { source: "pulmonary embolism", target: "embolia pulmonar" },
    { source: "aneurysm", target: "aneurisma" },
    { source: "MRI", target: "resonancia magnética" },
    { source: "CT scan", target: "tomografía computarizada" },
    { source: "anesthesia", target: "anestesia" },
    { source: "chemotherapy", target: "quimioterapia" },
    { source: "dialysis", target: "diálisis" },
    { source: "diagnosis", target: "diagnóstico" },
    { source: "prescription", target: "receta médica" },
    { source: "blood pressure", target: "presión arterial" },
    { source: "heart rate", target: "frecuencia cardíaca" },
    { source: "oxygen saturation", target: "saturación de oxígeno" },
    { source: "informed consent", target: "consentimiento informado" },
    { source: "plaintiff", target: "demandante" },
    { source: "defendant", target: "demandado" },
    { source: "testimony", target: "testimonio" },
    { source: "subpoena", target: "citación judicial" },
    { source: "verdict", target: "veredicto" },
    { source: "reasonable doubt", target: "duda razonable" },
    { source: "power of attorney", target: "poder notarial" },
    { source: "asylum", target: "asilo" },
    { source: "deportation", target: "deportación" },
    { source: "custody", target: "custodia" },
  ],
  ar: [
    // Core conditions
    { source: "stroke", target: "سكتة دماغية" },
    { source: "seizure", target: "نوبة صرع" },
    { source: "hypertension", target: "ارتفاع ضغط الدم" },
    { source: "diabetes", target: "مرض السكري" },
    { source: "myocardial infarction", target: "احتشاء عضلة القلب" },
    { source: "pulmonary embolism", target: "انسداد رئوي" },
    { source: "aneurysm", target: "تمدد الأوعية الدموية" },
    // Cardiology
    { source: "cardiomyopathy", target: "اعتلال عضلة القلب" },
    { source: "ischemic cardiomyopathy", target: "اعتلال عضلة القلب الإقفاري" },
    { source: "congestive heart failure", target: "فشل القلب الاحتقاني" },
    { source: "heart failure", target: "فشل القلب" },
    { source: "hypertensive heart disease", target: "اعتلال القلب الناتج عن ارتفاع ضغط الدم" },
    { source: "microvascular complications", target: "المضاعفات الدموية الدقيقة" },
    { source: "echocardiogram", target: "تخطيط صدى القلب" },
    { source: "transthoracic echocardiogram", target: "تخطيط صدى القلب عبر جدار الصدر" },
    { source: "electrocardiogram", target: "تخطيط القلب الكهربائي" },
    { source: "EKG", target: "تخطيط القلب الكهربائي" },
    { source: "ECG", target: "تخطيط القلب الكهربائي" },
    { source: "Holter monitoring", target: "مراقبة هولتر" },
    { source: "ambulatory Holter monitoring", target: "مراقبة هولتر الخارجية" },
    { source: "coronary CT angiography", target: "تصوير الأوعية التاجية بالأشعة المقطعية" },
    { source: "CT angiography", target: "تصوير الأوعية بالأشعة المقطعية" },
    { source: "arrhythmia", target: "اضطراب النظم القلبي" },
    { source: "tachycardia", target: "تسرع القلب" },
    { source: "bradycardia", target: "بطء القلب" },
    // Nephrology
    { source: "glomerular filtration rate", target: "معدل الترشيح الكبيبي" },
    { source: "estimated glomerular filtration rate", target: "معدل الترشيح الكبيبي التقديري" },
    { source: "diabetic nephropathy", target: "اعتلال الكلية السكري" },
    { source: "microalbumin", target: "الميكروألبومين" },
    { source: "microalbumin-to-creatinine ratio", target: "نسبة الميكروألبومين إلى الكرياتينين" },
    { source: "creatinine", target: "الكرياتينين" },
    { source: "nephritis", target: "التهاب الكلى" },
    // Metabolic / labs
    { source: "HbA1c", target: "الهيموغلوبين الغليكوزيلاتي" },
    { source: "hemoglobin A1c", target: "الهيموغلوبين الغليكوزيلاتي" },
    { source: "dyslipidemia", target: "دسليبيدميا" },
    { source: "metabolic panel", target: "اللوحة الأيضية" },
    { source: "comprehensive metabolic panel", target: "اللوحة الأيضية الشاملة" },
    { source: "blood glucose", target: "سكر الدم" },
    { source: "type 2 diabetes mellitus", target: "داء السكري من النوع الثاني" },
    { source: "type 2 diabetes", target: "السكري من النوع الثاني" },
    { source: "insulin", target: "الأنسولين" },
    // Ophthalmology
    { source: "ophthalmologic evaluation", target: "التقييم الطبي للعين" },
    { source: "differential diagnosis", target: "التشخيص التفريقي" },
    // Procedures / imaging
    { source: "MRI", target: "التصوير بالرنين المغناطيسي" },
    { source: "CT scan", target: "الأشعة المقطعية" },
    { source: "anesthesia", target: "التخدير" },
    { source: "chemotherapy", target: "العلاج الكيميائي" },
    { source: "dialysis", target: "غسيل الكلى" },
    // Clinical
    { source: "diagnosis", target: "التشخيص" },
    { source: "prescription", target: "وصفة طبية" },
    { source: "blood pressure", target: "ضغط الدم" },
    { source: "heart rate", target: "معدل ضربات القلب" },
    { source: "oxygen saturation", target: "تشبع الأكسجين" },
    { source: "informed consent", target: "موافقة مستنيرة" },
    // Legal
    { source: "plaintiff", target: "المدعي" },
    { source: "defendant", target: "المدعى عليه" },
    { source: "testimony", target: "شهادة" },
    { source: "verdict", target: "حكم" },
    { source: "reasonable doubt", target: "شك معقول" },
    { source: "power of attorney", target: "وكالة قانونية" },
    { source: "asylum", target: "لجوء" },
    { source: "deportation", target: "ترحيل" },
    { source: "custody", target: "حضانة" },
  ],
};

// Compact core TERMS_BY_LANG only (ar/es initial maps). Large body/legal/insurance
// dumps were removed — they blew Soniox's context budget and drowned vaccine /
// critical medical pins. Coverage for other langs comes from the vaccine pack +
// critical-medical-terms.ts.

// Fallbacks for other language pairs: keep only EN anchors when pair-specific map missing.

export function getInterpreterContext(
  langA: string,
  langB: string,
  injectedTerms: SonioxContextTerm[] = [],
): SonioxContext {
  const a = langA.split("-")[0]!.toLowerCase();
  const b = langB.split("-")[0]!.toLowerCase();
  const terms: SonioxContextTerm[] = [];
  const seen = new Set<string>();

  const pushProtected = (source: string, target: string) => {
    const s = source.trim();
    const t = target.trim();
    if (!s || !t) return;
    const key = `${s}->${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ source: s, target: t });
  };

  // Priority stack (budget-protected, in order):
  // 1) personal glossary  2) critical medical  3) critical claim/auto/body
  // 4) vaccine pack
  for (const t of injectedTerms) {
    pushProtected(`${t.source ?? ""}`, `${t.target ?? ""}`);
  }
  for (const lang of [a, b]) {
    if (lang === "en") continue;
    for (const t of criticalMedicalTermsForLang(lang)) {
      pushProtected(t.source, t.target);
      pushProtected(t.target, t.source);
    }
    for (const t of criticalClaimTermsForLang(lang)) {
      pushProtected(t.source, t.target);
      pushProtected(t.target, t.source);
    }
  }

  // Full workspace codes so zh-CN / zh-TW resolve in the vaccine pack.
  const medicalPack = buildChunkV2MedicalPackContext(langA, langB);
  for (const t of medicalPack.translation_terms) {
    pushProtected(t.source, t.target);
  }
  const protectedGlossaryCount = terms.length;

  const addTerms = (from: string, to: string) => {
    if (from === "en" && TERMS_BY_LANG[to]) {
      for (const t of TERMS_BY_LANG[to]!) {
        const key = `${t.source}->${t.target}`;
        if (!seen.has(key)) { seen.add(key); terms.push(t); }
      }
    }
    if (to === "en" && TERMS_BY_LANG[from]) {
      for (const t of TERMS_BY_LANG[from]!) {
        const flipped: SonioxContextTerm = { source: t.target, target: t.source };
        const key = `${flipped.source}->${flipped.target}`;
        if (!seen.has(key)) { seen.add(key); terms.push(flipped); }
      }
    }
    if (from !== "en" && to !== "en") {
      for (const lang of [from, to]) {
        if (TERMS_BY_LANG[lang]) {
          for (const t of TERMS_BY_LANG[lang]!) {
            const key = `${t.source}->${t.target}`;
            if (!seen.has(key)) { seen.add(key); terms.push(t); }
          }
        }
      }
    }
  };

  addTerms(a, b);
  addTerms(b, a);

  if ((a === "en" && b === "es") || (a === "es" && b === "en")) {
    const enEsExtraTerms: SonioxContextTerm[] = [
      { source: "safe for fluids", target: "apto para recibir líquidos" },
      { source: "urine analysis", target: "análisis de orina" },
      { source: "good faith exam", target: "examen de buena fe" },
      { source: "kidney function", target: "función renal" },
      { source: "nurse practitioner", target: "enfermera practicante" },
      { source: "vitamin D supplement", target: "suplemento de vitamina D" },
      { source: "urinary tract infection", target: "infección de las vías urinarias" },
      { source: "date of birth", target: "fecha de nacimiento" },
      { source: "consent for telehealth", target: "consentimiento para teleconsulta" },
    ];
    for (const t of enEsExtraTerms) {
      const key = `${t.source}->${t.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        terms.push(t);
      }
    }
  }

  // Tight recognition pins only — full MEDICAL+LEGAL dumps were drowning budget.
  const pinSeen = new Set<string>();
  const recognitionPins: string[] = [];
  const pushPin = (raw: string) => {
    const t = raw.trim();
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (pinSeen.has(k)) return;
    pinSeen.add(k);
    recognitionPins.push(t);
  };
  for (const t of medicalPack.terms) pushPin(t);
  for (const en of CRITICAL_MEDICAL_EN_SET) pushPin(en);
  for (const en of CRITICAL_CLAIM_EN_SET) pushPin(en);
  // Small legal STT anchors (claims / court).
  for (const t of [
    "plaintiff", "defendant", "testimony", "subpoena", "deposition",
    "verdict", "settlement", "liability", "negligence", "malpractice",
    "custody", "asylum", "deportation", "restraining order",
  ]) {
    pushPin(t);
  }
  // Remaining medical/legal pins are low priority (budget trim drops from end).
  for (const t of MEDICAL_TERMS_EN) pushPin(t);
  for (const t of LEGAL_TERMS_EN) pushPin(t);

  const ctx: SonioxContext = {
    general: [
      { key: "domain", value: "Medical, legal, and insurance interpretation" },
      { key: "setting", value: "Live professional interpreter session" },
      { key: "role", value: "Human interpreter relaying speech between two parties" },
      { key: "accuracy", value: "Preserve exact numbers, drug names, vaccine names, body-part injuries, auto-accident terms, insurance terms, and codes" },
      {
        key: "translation_register",
        value:
          "TRANSLATION column only: always the formal professional written standard of the TARGET language (medical/legal documents). Never colloquial, slang, or regional dialect in translation.",
      },
      {
        key: "original_as_spoken",
        value:
          "ORIGINAL/transcription: write speech exactly as heard (any dialect). Critical: spoken dialect in the original must NEVER change translation register.",
      },
      ...(a === "ar" || b === "ar"
        ? [
            {
              key: "arabic_translation_msa",
              value:
                "When translating INTO Arabic: ALWAYS Modern Standard Arabic only (العربية الفصحى / MSA). Forbidden in translation: Egyptian, Iraqi, Levantine, Gulf, or any dialect.",
            },
          ]
        : []),
      {
        key: "language_register",
        value:
          "Always translate into formal standard written language of the target. Never use colloquial or regional dialect forms in any translation.",
      },
      {
        key: "no_invented_words",
        value:
          "Never invent or guess words. If uncertain, use the most common standard formal equivalent in the target.",
      },
      {
        key: "full_phrase_meaning",
        value:
          "Translate full clinical/legal meaning of phrases, not word-by-word.",
      },
      ...(a === "es" || b === "es"
        ? [
            {
              key: "spanish_gender",
              value:
                "Spanish: análisis, sistema, problema, tema, idioma, diagnóstico are masculine (un análisis, el sistema).",
            },
          ]
        : []),
    ],
    terms: recognitionPins,
  };

  if (terms.length > 0) {
    ctx.translation_terms = terms;
  }

  // Fit translation_terms first with reserved headroom so recognition pins survive.
  const PIN_RESERVE_CHARS = 1_000;
  const coreFitted = fitSonioxContextToBudget(
    { ...ctx, terms: [] },
    {
      protectedTranslationTermCount: protectedGlossaryCount,
      maxChars: Math.max(3_500, SONIOX_CONTEXT_SAFE_CHARS - PIN_RESERVE_CHARS),
    },
  );
  coreFitted.terms = recognitionPins;
  const fitted = fitSonioxContextToBudget(coreFitted, {
    protectedTranslationTermCount: Math.min(
      protectedGlossaryCount,
      coreFitted.translation_terms?.length ?? 0,
    ),
    maxChars: SONIOX_CONTEXT_SAFE_CHARS,
  });
  if (!import.meta.env.PROD && sonioxContextCharLength(fitted) > SONIOX_CONTEXT_SAFE_CHARS) {
    console.warn(
      "[canonAppendWs] Soniox context still over budget after trim:",
      sonioxContextCharLength(fitted),
    );
  }
  return fitted;
}
