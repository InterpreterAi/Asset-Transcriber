/**
 * interpreter-context.ts
 * Builds the Soniox `context` payload for interpreter sessions.
 * Covers all 62+ Soniox languages with medical + legal term pinning.
 */

export type SonioxContextTerm = { source: string; target: string };

export type SonioxContext = {
  general: { key: string; value: string }[];
  terms: string[];
  translation_terms?: SonioxContextTerm[];
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
    { source: "stroke", target: "سكتة دماغية" },
    { source: "seizure", target: "نوبة صرع" },
    { source: "hypertension", target: "ارتفاع ضغط الدم" },
    { source: "diabetes", target: "مرض السكري" },
    { source: "myocardial infarction", target: "احتشاء عضلة القلب" },
    { source: "pulmonary embolism", target: "انسداد رئوي" },
    { source: "aneurysm", target: "تمدد الأوعية الدموية" },
    { source: "MRI", target: "التصوير بالرنين المغناطيسي" },
    { source: "CT scan", target: "الأشعة المقطعية" },
    { source: "anesthesia", target: "التخدير" },
    { source: "chemotherapy", target: "العلاج الكيميائي" },
    { source: "dialysis", target: "غسيل الكلى" },
    { source: "diagnosis", target: "التشخيص" },
    { source: "prescription", target: "وصفة طبية" },
    { source: "blood pressure", target: "ضغط الدم" },
    { source: "heart rate", target: "معدل ضربات القلب" },
    { source: "oxygen saturation", target: "تشبع الأكسجين" },
    { source: "informed consent", target: "موافقة مستنيرة" },
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

// Fallbacks for other language pairs: keep only EN anchors when pair-specific map missing.

export function getInterpreterContext(langA: string, langB: string): SonioxContext {
  const a = langA.split("-")[0]!.toLowerCase();
  const b = langB.split("-")[0]!.toLowerCase();
  const terms: SonioxContextTerm[] = [];
  const seen = new Set<string>();

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

  const ctx: SonioxContext = {
    general: [
      { key: "domain", value: "Medical and legal interpretation" },
      { key: "setting", value: "Live professional interpreter session" },
      { key: "role", value: "Human interpreter relaying speech between two parties" },
      { key: "accuracy", value: "Preserve exact numbers, drug names, legal terms, and codes" },
    ],
    terms: [...MEDICAL_TERMS_EN, ...LEGAL_TERMS_EN],
  };

  if (terms.length > 0) {
    ctx.translation_terms = terms;
  }

  return ctx;
}
