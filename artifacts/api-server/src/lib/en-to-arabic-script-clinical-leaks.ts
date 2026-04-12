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
];

const ENGLISH_TO_ARABIC_REPLACEMENTS: [string, string][] = [...ENGLISH_TO_ARABIC_REPLACEMENTS_RAW].sort(
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
  return t.replace(/\s{2,}/g, " ").trim();
}
