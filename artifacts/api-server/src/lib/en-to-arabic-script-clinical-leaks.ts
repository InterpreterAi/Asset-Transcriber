/**
 * High-frequency English medical/legal/insurance terms models leave in Latin letters inside Arabic output.
 * Static MSA replacements (fast, no extra API). Phrase list is also used to drive MT repair for other targets.
 */

export function escapeRegExpForLeaks(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longer phrases first so "ct scan" wins over shorter keys. */
const ENGLISH_TO_ARABIC_REPLACEMENTS_RAW: [string, string][] = [
  ["heart attack", "نوبة قلبية"],
  ["blood pressure", "ضغط الدم"],
  ["blood sugar", "سكر الدم"],
  ["side effects", "آثار جانبية"],
  ["physical therapy", "علاج طبيعي"],
  ["ct scan", "التصوير المقطعي"],
  ["cat scan", "التصوير المقطعي"],
  ["mri scan", "التصوير بالرنين المغناطيسي"],
  ["pet scan", "التصوير المقطعي بالإصدار البوزيتروني"],
  ["sigmoidoscopy", "تنظير السيني"],
  ["colonoscopy", "تنظير القولون"],
  ["colonoscopies", "تنظيرات القولون"],
  ["colonoscope", "منظار القولون"],
  ["gastroscopy", "تنظير المعدة"],
  ["bronchoscopy", "تنظير القصبات"],
  ["endoscopy", "تنظير داخلي"],
  ["laparoscopy", "تنظير البطن"],
  ["arthroscopy", "تنظير المفصل"],
  ["echocardiogram", "رسم القلب بالموجات فوق الصوتية"],
  ["electrocardiogram", "تخطيط كهربائية القلب"],
  ["ultrasound", "السونار"],
  ["anesthesia", "التخدير"],
  ["anaesthesia", "التخدير"],
  ["appendicitis", "التهاب الزائدة الدودية"],
  ["appendectomy", "استئصال الزائدة الدودية"],
  ["pneumonia", "ذات الرئة"],
  ["hypertension", "ارتفاع ضغط الدم"],
  ["hypotension", "انخفاض ضغط الدم"],
  ["cholesterol", "الكوليسترول"],
  ["diabetes", "داء السكري"],
  ["insulin", "الأنسولين"],
  ["biopsy", "خزعة"],
  ["chemotherapy", "العلاج الكيميائي"],
  ["radiation therapy", "العلاج الإشعاعي"],
  ["physical exam", "الفحص السريري"],
  ["defendant", "المدعى عليه"],
  ["plaintiff", "المدعي"],
  ["deposition", "شهادة شاهد"],
  ["subpoena", "استدعاء"],
  ["settlement", "تسوية"],
  ["negligence", "إهمال"],
  ["malpractice", "خطأ مهني طبي"],
  ["statute of limitations", "التقادم"],
  ["deductible", "التحمل"],
  ["copay", "الدفع المشترك"],
  ["co-pay", "الدفع المشترك"],
  ["premium", "قسط التأمين"],
  ["liability", "المسؤولية"],
  ["claimant", "صاحب المطالبة"],
  ["subrogation", "حق الرجوع التأميني"],
  ["beneficiary", "المستفيد"],
  ["appendix", "الزائدة الدودية"],
  ["asthma", "الربو"],
  ["catheter", "قسطرة"],
  ["mri", "الرنين المغناطيسي"],
  ["ekg", "تخطيط القلب"],
  ["ecg", "تخطيط القلب"],
  ["hemodialysis", "غسيل الكلى الدموي"],
  ["peritoneal dialysis", "غسيل الكلى البريتوني"],
  ["kidney dialysis", "غسيل الكلى"],
  ["dialysis", "غسيل الكلى"],
  ["dialyses", "جلسات غسيل الكلى"],
  ["fistula", "ناسور"],
  ["hemorrhoids", "البواسير"],
  ["hemorrhoid", "البواسير"],
  ["fibrosis", "تليف"],
  ["cirrhosis", "تليف الكبد"],
  ["renal failure", "فشل كلوي"],
  ["renal", "كلوي"],
  ["nephrology", "أمراض الكلى"],
  ["nephrologist", "طبيب أمراض الكلى"],
  ["ureter", "الحالب"],
  ["bladder", "المثانة"],
  ["prostate", "البروستاتا"],
  ["metastasis", "انتشار سرطاني"],
  ["metastatic", "منتشر"],
  ["oncology", "علم الأورام"],
  ["oncologist", "أخصائي أورام"],
  ["sepsis", "تسمم الدم"],
  ["stroke", "سكتة دماغية"],
  ["seizure", "نوبة صرع"],
  ["fibroid", "ليف رحمي"],
  // Curated additions (EN→AR static leak pass — high-frequency clinical / insurance gloss in Latin).
  ["respiratory syncytial virus", "الفيروس المخلوي التنفسي"],
  ["prior authorization", "الموافقة المسبقة من شركة التأمين"],
  ["gestational diabetes", "سكري الحمل"],
  ["health insurance", "التأمين الصحي"],
  ["insurance coverage", "التغطية التأمينية"],
  ["insurance policy", "وثيقة التأمين"],
  ["insurance claim", "مطالبة التأمين"],
  ["short term disability", "إعاقة قصيرة الأمد"],
  ["long term care", "رعاية طويلة الأمد"],
  ["out of pocket", "نفقات لا يغطيها التأمين"],
  ["copayment", "الدفع المشترك"],
  ["prenatal care", "رعاية ما قبل الولادة"],
  ["postpartum", "بعد الولادة"],
  ["miscarriage", "إجهاض"],
  ["stillbirth", "ولادة ميت"],
  ["preeclampsia", "تسمم الحمل"],
  ["trimester", "ثلث من الحمل"],
  ["gynecology", "أمراض النساء"],
  ["obstetrics", "طب التوليد"],
  ["obstetrician", "طبيب توليد"],
  ["ultrasound pregnancy", "سونار الحمل"],
  ["rsv", "فيروس المخلوي التنفسي"],
  ["pregnancy", "الحمل"],
  ["pregnant", "حامل"],
  ["prenatal", "ما قبل الولادة"],
  ["maternity", "الأمومة"],
  // Rodriguez / cardiology live EN→AR leaks (high-frequency in Morsy Urgent medical calls).
  ["congestive heart failure", "قصور القلب الاحتقاني"],
  ["coronary artery bypass graft surgery", "جراحة مجازة الشريان التاجي"],
  ["coronary artery bypass graft", "مجازة الشريان التاجي"],
  ["coronary artery disease", "مرض الشريان التاجي"],
  ["percutaneous coronary intervention", "التدخل التاجي عبر الجلد"],
  ["drug-eluting stent placement", "زرع دعامة طاردة للدواء"],
  ["drug-eluting stent", "دعامة طاردة للدواء"],
  ["drug eluting stent", "دعامة طاردة للدواء"],
  ["cardiac catheterization report", "تقرير قسطرة القلب"],
  ["cardiac catheterization", "قسطرة القلب"],
  ["left ventricular ejection fraction", "نسبة إخراج البطين الأيسر"],
  ["ejection fraction", "نسبة الإخراج"],
  ["heart failure", "قصور القلب"],
  ["type 2 diabetes mellitus", "داء السكري من النوع الثاني"],
  ["type 2 diabetes", "داء السكري من النوع الثاني"],
  ["type 1 diabetes mellitus", "داء السكري من النوع الأول"],
  ["type 1 diabetes", "داء السكري من النوع الأول"],
  ["diabetes mellitus", "داء السكري"],
  ["chronic kidney disease stage 3", "مرض الكلى المزمن من المرحلة الثالثة"],
  ["chronic kidney disease", "مرض الكلى المزمن"],
  ["kidney disease", "مرض الكلى"],
  ["atrial fibrillation", "الرجفان الأذيني"],
  ["hyperlipidemia", "فرط شحميات الدم"],
  ["medical history", "التاريخ الطبي"],
  ["laparoscopic cholecystectomy", "استئصال المرارة بالمنظار"],
  ["myocardial infarction", "احتشاء عضلة القلب"],
  ["transient ischemic attack", "نوبة نقص تروية عابرة"],
  ["creatinine", "الكرياتينين"],
  ["hemoglobin a1c", "الهيموغلوبين الغليكوزيلي"],
  ["glycosylated hemoglobin", "الهيموغلوبين الغليكوزيلي"],
  ["hba1c", "الهيموغلوبين الغليكوزيلي"],
  ["bnp", "الببتيد الناتريوريتي"],
  ["nt-probnp", "الببتيد الناتريوريتي"],
  ["mg/dl", "ملغ/دL"],
  ["estimated glomerular filtration rate", "معدل الترشيح الكلوي المقدّر"],
  ["glomerular filtration rate", "معدل الترشيح الكلوي"],
  ["egfr", "معدل الترشيح الكلوي المقدّر"],
  ["ml/min per 1.73 m2", "مل/دقيقة لكل 1.73 متر مربع"],
  ["mL/min per 1.73 m2", "مل/دقيقة لكل 1.73 متر مربع"],
  ["urine microalbumin-to-creatinine ratio", "نسبة الألبومين الجزيئي الدقيق في البول إلى الكرياتينين"],
  ["microalbumin-to-creatinine ratio", "نسبة الألبومين الجزيئي الدقيق في البول إلى الكرياتينين"],
  ["microalbumin", "الألبومين الجزيئي الدقيق"],
  ["dyslipidemia", "خلل شحميات الدم"],
  ["ischemic cardiomyopathy", "اعتلال عضلة القلب الإقفاري"],
  ["hypertensive heart disease", "مرض القلب الضغطي"],
  ["cardiomyopathy", "اعتلال عضلة القلب"],
  ["microvascular complications", "مضاعفات الأوعية الدقيقة"],
  ["long-standing", "مزمن"],
  ["transthoracic echocardiogram", "تخطيط صدى القلب عبر الصدر"],
  ["transthoracic", "عبر الصدر"],
  ["coronary computed tomography angiography", "التصوير المقطعي المحوسب للأوعية التاجية"],
  ["coronary ct angiography", "التصوير المقطعي المحوسب للأوعية التاجية"],
  ["computed tomography angiography", "التصوير المقطعي المحوسب للأوعية"],
  ["coronary angiography", "تصوير الأوعية التاجية"],
  ["angiography", "تصوير الأوعية"],
  ["ambulatory holter monitoring", "مراقبة هولتر الخارجية"],
  ["holter monitoring", "مراقبة هولتر"],
  ["holter", "هولتر"],
  ["comprehensive metabolic panel", "لوحة الأيض الشاملة"],
  ["comprehensive", "شامل"],
  ["metabolic panel", "لوحة الأيض"],
  ["coronary", "التاجي"],
  ["urine", "البول"],
  ["ratio", "النسبة"],
  ["significantly elevated", "مرتفع بشكل ملحوظ"],
  ["cardiac sympathetic", "الودي القلبي"],
  ["sympathetic", "ودي"],
  ["like to order", "أود أن أطلب"],
  ["i would like to order", "أود أن أطلب"],
  ["the different diagnosis", "التشخيصات المختلفة"],
  ["the different diag", "التشخيصات المختلفة"],
  ["different diag", "التشخيصات المختلفة"],
  ["diag", "التشخيص"],
  ["diagnosis", "التشخيص"],
  ["diagnoses", "التشخيصات"],
  ["includes", "يشمل"],
  ["includess", "يشمل"],
  ["secondary to", "ثانوي لـ"],
  ["early stage", "المراحل المبكرة"],
  ["early stages", "المراحل المبكرة"],
  ["type ii", "النوع الثاني"],
  ["type 2", "النوع الثاني"],
  ["type i", "النوع الأول"],
  ["type 1", "النوع الأول"],
];

/**
 * English → Arabic **only** (not merged into {@link getEnglishDomainLeakPhrasesSorted} — avoids
 * changing MT repair for Spanish/French/etc.). Covers symptoms often left in Latin letters in live EN→AR.
 */
const ARABIC_ONLY_MEDICAL_LEAKS_RAW: [string, string][] = [
  ["pins and needles", "وخز وأبر"],
  ["loss of sensation", "فقدان الإحساس"],
  ["shortness of breath", "ضيق في التنفس"],
  ["difficulty breathing", "صعوبة في التنفس"],
  ["abdominal pain", "ألم بطني"],
  ["muscle pain", "ألم عضلي"],
  ["joint pain", "ألم في المفاصل"],
  ["back pain", "ألم في الظهر"],
  ["chest pain", "ألم في الصدر"],
  ["blurred vision", "رؤية ضبابية"],
  ["hearing loss", "فقدان السمع"],
  ["runny nose", "سيلان الأنف"],
  ["sore throat", "التهاب في الحلق"],
  ["numbness", "خدر"],
  ["tingling", "وخز"],
  ["dizziness", "دوخة"],
  ["vomiting", "قيء"],
  ["headache", "صداع"],
  ["fatigue", "إرهاق"],
  ["weakness", "ضعف"],
  ["swelling", "تورم"],
  ["itching", "حكة"],
  ["nausea", "غثيان"],
  ["rash", "طفح جلدي"],
];

const ENGLISH_TO_ARABIC_REPLACEMENTS: [string, string][] = [...ENGLISH_TO_ARABIC_REPLACEMENTS_RAW].sort(
  (a, b) => b[0].length - a[0].length,
);

const ARABIC_ONLY_MEDICAL_LEAKS: [string, string][] = [...ARABIC_ONLY_MEDICAL_LEAKS_RAW].sort(
  (a, b) => b[0].length - a[0].length,
);

/** English phrases (longest first) for leak detection + non-Arabic MT repair. */
export function getEnglishDomainLeakPhrasesSorted(): string[] {
  return ENGLISH_TO_ARABIC_REPLACEMENTS.map(([en]) => en);
}

export function applyArabicStaticLeakReplacements(translated: string): string {
  let t = translated;
  if (!t || !/[A-Za-z]{3,}/.test(t)) return t;

  for (const [en, ar] of ENGLISH_TO_ARABIC_REPLACEMENTS) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExpForLeaks(en)}(?![A-Za-z])`, "gi");
    t = t.replace(re, ar);
  }
  for (const [en, ar] of ARABIC_ONLY_MEDICAL_LEAKS) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExpForLeaks(en)}(?![A-Za-z])`, "gi");
    t = t.replace(re, ar);
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

/**
 * Mixed Arabic/Latin glue from Libre partial translation (EN→AR live medical).
 * Runs after static phrase map; cheap, no extra MT calls.
 */
export function polishArabicEnglishGlueLeaks(translated: string): string {
  if (!translated || !/[\u0600-\u06FF]/.test(translated)) return translated;
  let t = translated;
  t = t.replace(
    /([\u0600-\u06FF][\u0600-\u06FF\s،,؛]*?)\s+is\s+(NUM_\d+|\d[\d.,%]*)/giu,
    "$1 يبلغ $2",
  );
  t = t.replace(/([\u0600-\u06FF][\u0600-\u06FF\s،,؛]*?)\s+is\s+/giu, "$1 ");
  t = t.replace(/\b(and|or)\b/gi, "و");
  t = t.replace(/\bto-\b/gi, "إلى");
  t = t.replace(
    /\burine\s+microalbumin-to-([\u0600-\u06FF]+)\s+ratio\b/giu,
    "نسبة الألبومين الجزيئي الدقيق في البول إلى $1",
  );
  t = t.replace(
    /\bالبول\s+microalbumin-to-([\u0600-\u06FF]+)\s+النسبة\b/giu,
    "نسبة الألبومين الجزيئي الدقيق في البول إلى $1",
  );
  t = t.replace(
    /\bالبول\s+الألبومين الجزيئي الدقيق-to-([\u0600-\u06FF]+)\s+النسبة\b/giu,
    "نسبة الألبومين الجزيئي الدقيق في البول إلى $1",
  );
  t = t.replace(/\bThe\s+(?=[\u0600-\u06FF])/gi, "");
  t = t.replace(/(?<=[\u0600-\u06FF][\u0600-\u06FF\s،,؛]*)\s+The\s+/giu, " ");
  t = t.replace(/\bI\.\s+like\s+to\s+order\b/gi, "أود أن أطلب");
  t = t.replace(/\bI\.\s+(?=[\u0600-\u06FF])/gi, "");
  t = t.replace(/\ba\s+(?=[\u0600-\u06FF])/gi, "");
  return t.replace(/\s{2,}/g, " ").trim();
}
