// Professional interpreter terminology glossary.
// Each entry covers one concept with translations keyed by BCP-47 base code.
// Lookup is bidirectional: source language is detected at query time.

export interface GlossaryEntry {
  translations: Record<string, string>;
}

export const glossary: GlossaryEntry[] = [
  // ── Medical ──────────────────────────────────────────────────────────────
  { translations: { en: "colonoscopy",           ar: "تنظير القولون" } },
  { translations: { en: "endoscopy",             ar: "تنظير داخلي" } },
  { translations: { en: "biopsy",                ar: "خزعة" } },
  { translations: { en: "anesthesia",            ar: "تخدير" } },
  { translations: { en: "general anesthesia",    ar: "تخدير عام" } },
  { translations: { en: "local anesthesia",      ar: "تخدير موضعي" } },
  { translations: { en: "diagnosis",             ar: "تشخيص" } },
  { translations: { en: "prognosis",             ar: "تشخيص مآلي" } },
  { translations: { en: "prescription",          ar: "وصفة طبية" } },
  { translations: { en: "surgery",               ar: "جراحة" } },
  { translations: { en: "laparoscopy",           ar: "تنظير البطن" } },
  { translations: { en: "MRI",                   ar: "التصوير بالرنين المغناطيسي" } },
  { translations: { en: "CT scan",               ar: "الأشعة المقطعية" } },
  { translations: { en: "ultrasound",            ar: "الموجات فوق الصوتية" } },
  { translations: { en: "blood pressure",        ar: "ضغط الدم" } },
  { translations: { en: "hypertension",          ar: "ارتفاع ضغط الدم" } },
  { translations: { en: "diabetes",              ar: "داء السكري" } },
  { translations: { en: "insulin",               ar: "الأنسولين" } },
  { translations: { en: "inflammation",          ar: "التهاب" } },
  { translations: { en: "infection",             ar: "عدوى" } },
  { translations: { en: "fracture",              ar: "كسر" } },
  { translations: { en: "tumor",                 ar: "ورم" } },
  { translations: { en: "malignant",             ar: "خبيث" } },
  { translations: { en: "benign",                ar: "حميد" } },
  { translations: { en: "chemotherapy",          ar: "العلاج الكيميائي" } },
  { translations: { en: "radiotherapy",          ar: "العلاج الإشعاعي" } },
  { translations: { en: "immunotherapy",         ar: "العلاج المناعي" } },
  { translations: { en: "cardiac arrest",        ar: "السكتة القلبية" } },
  { translations: { en: "stroke",                ar: "السكتة الدماغية" } },
  { translations: { en: "kidney failure",        ar: "الفشل الكلوي" } },
  { translations: { en: "liver failure",         ar: "الفشل الكبدي" } },
  { translations: { en: "transplant",            ar: "زراعة عضو" } },
  { translations: { en: "allergy",               ar: "حساسية" } },
  { translations: { en: "side effects",          ar: "آثار جانبية" } },
  { translations: { en: "dosage",                ar: "الجرعة" } },
  { translations: { en: "intensive care unit",   ar: "وحدة العناية المركزة" } },
  { translations: { en: "emergency room",        ar: "غرفة الطوارئ" } },
  { translations: { en: "outpatient",            ar: "مريض خارجي" } },
  { translations: { en: "inpatient",             ar: "مريض مقيم" } },
  { translations: { en: "clinical trial",        ar: "تجربة سريرية" } },

  // ── Pharmaceutical ────────────────────────────────────────────────────────
  { translations: { en: "antibiotic",            ar: "مضاد حيوي" } },
  { translations: { en: "analgesic",             ar: "مسكن للألم" } },
  { translations: { en: "anti-inflammatory",     ar: "مضاد للالتهاب" } },
  { translations: { en: "sedative",              ar: "مهدئ" } },
  { translations: { en: "vaccine",               ar: "لقاح" } },
  { translations: { en: "contraindication",      ar: "موانع الاستخدام" } },
  { translations: { en: "pharmacist",            ar: "صيدلاني" } },
  { translations: { en: "generic drug",          ar: "دواء جنيسي" } },

  // ── Anatomical ────────────────────────────────────────────────────────────
  { translations: { en: "appendix",              ar: "الزائدة الدودية" } },
  { translations: { en: "gallbladder",           ar: "المرارة" } },
  { translations: { en: "pancreas",              ar: "البنكرياس" } },
  { translations: { en: "thyroid",               ar: "الغدة الدرقية" } },
  { translations: { en: "esophagus",             ar: "المريء" } },
  { translations: { en: "trachea",               ar: "القصبة الهوائية" } },
  { translations: { en: "femur",                 ar: "عظم الفخذ" } },
  { translations: { en: "spinal cord",           ar: "النخاع الشوكي" } },

  // ── Legal ─────────────────────────────────────────────────────────────────
  { translations: { en: "contract",              ar: "عقد" } },
  { translations: { en: "lawsuit",               ar: "دعوى قضائية" } },
  { translations: { en: "plaintiff",             ar: "المدعي" } },
  { translations: { en: "defendant",             ar: "المدعى عليه" } },
  { translations: { en: "attorney",              ar: "محامٍ" } },
  { translations: { en: "affidavit",             ar: "إفادة مُقسَّمة" } },
  { translations: { en: "jurisdiction",          ar: "اختصاص قضائي" } },
  { translations: { en: "verdict",               ar: "حكم" } },
  { translations: { en: "appeal",                ar: "استئناف" } },
  { translations: { en: "testimony",             ar: "شهادة" } },
  { translations: { en: "warrant",               ar: "أمر قضائي" } },
  { translations: { en: "subpoena",              ar: "أمر إحضار" } },
  { translations: { en: "settlement",            ar: "تسوية" } },
  { translations: { en: "intellectual property", ar: "الملكية الفكرية" } },
  { translations: { en: "power of attorney",     ar: "توكيل رسمي" } },
  { translations: { en: "civil court",           ar: "المحكمة المدنية" } },
  { translations: { en: "criminal court",        ar: "المحكمة الجنائية" } },

  // ── Financial ─────────────────────────────────────────────────────────────
  { translations: { en: "invoice",               ar: "فاتورة" } },
  { translations: { en: "balance sheet",         ar: "الميزانية العمومية" } },
  { translations: { en: "income statement",      ar: "قائمة الدخل" } },
  { translations: { en: "cash flow",             ar: "التدفق النقدي" } },
  { translations: { en: "dividend",              ar: "أرباح الأسهم" } },
  { translations: { en: "collateral",            ar: "ضمانة" } },
  { translations: { en: "amortization",          ar: "الاستهلاك" } },
  { translations: { en: "audit",                 ar: "تدقيق" } },
  { translations: { en: "insolvency",            ar: "إعسار" } },
  { translations: { en: "bankruptcy",            ar: "إفلاس" } },
  { translations: { en: "interest rate",         ar: "سعر الفائدة" } },
  { translations: { en: "mortgage",              ar: "رهن عقاري" } },
  { translations: { en: "equity",               ar: "حقوق الملكية" } },
  { translations: { en: "liability",             ar: "التزام مالي" } },

  // ── Government / Official ─────────────────────────────────────────────────
  { translations: { en: "citizenship",           ar: "الجنسية" } },
  { translations: { en: "residence permit",      ar: "تصريح الإقامة" } },
  { translations: { en: "asylum",                ar: "اللجوء" } },
  { translations: { en: "extradition",           ar: "التسليم القضائي" } },
  { translations: { en: "treaty",                ar: "معاهدة" } },
  { translations: { en: "sanction",              ar: "عقوبة" } },
  { translations: { en: "embassy",               ar: "سفارة" } },
  { translations: { en: "consulate",             ar: "قنصلية" } },
  { translations: { en: "customs",               ar: "الجمارك" } },
  { translations: { en: "passport",              ar: "جواز السفر" } },

  // ── Engineering / Technical ───────────────────────────────────────────────
  { translations: { en: "infrastructure",        ar: "بنية تحتية" } },
  { translations: { en: "specification",         ar: "مواصفات" } },
  { translations: { en: "calibration",           ar: "معايرة" } },
  { translations: { en: "algorithm",             ar: "خوارزمية" } },
  { translations: { en: "bandwidth",             ar: "عرض النطاق الترددي" } },
  { translations: { en: "encryption",            ar: "التشفير" } },
  { translations: { en: "prototype",             ar: "نموذج أولي" } },

  // ── Business ─────────────────────────────────────────────────────────────
  { translations: { en: "procurement",           ar: "المشتريات" } },
  { translations: { en: "tender",                ar: "مناقصة" } },
  { translations: { en: "due diligence",         ar: "العناية الواجبة" } },
  { translations: { en: "merger",                ar: "اندماج" } },
  { translations: { en: "acquisition",           ar: "استحواذ" } },
  { translations: { en: "stakeholder",           ar: "صاحب مصلحة" } },
  { translations: { en: "shareholders",          ar: "المساهمون" } },
  { translations: { en: "board of directors",    ar: "مجلس الإدارة" } },
  { translations: { en: "memorandum of understanding", ar: "مذكرة تفاهم" } },
];

// Build a reverse lookup: for each entry find the term for a given source language.
export function findTermHints(
  text: string,
  sourceLang: string,
  targetLang: string,
): string[] {
  const srcBase = sourceLang.split("-")[0]!.toLowerCase();
  const tgtBase = targetLang.split("-")[0]!.toLowerCase();
  const hints: string[] = [];

  for (const entry of glossary) {
    const srcTerm = entry.translations[srcBase];
    const tgtTerm = entry.translations[tgtBase];
    if (!srcTerm || !tgtTerm) continue;
    if (text.toLowerCase().includes(srcTerm.toLowerCase())) {
      hints.push(`"${srcTerm}" → "${tgtTerm}"`);
    }
  }

  return hints;
}
