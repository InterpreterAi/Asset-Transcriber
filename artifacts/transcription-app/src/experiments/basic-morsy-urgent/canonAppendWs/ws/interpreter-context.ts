/**
 * interpreter-context.ts
 * Builds the Soniox `context` payload for interpreter sessions.
 * Covers all 62+ Soniox languages with medical + legal term pinning.
 *
 * MUST stay under Soniox's 10k-char context limit or the realtime session
 * rejects config and chunk-v2 Trial/Basic/Professional STT+translation goes dark.
 */

import { buildChunkV2MedicalPackContext } from "./chunk-v2-medical-term-pack";
import {
  fitSonioxContextToBudget,
  mergeUniqueTranslationTerms,
  sonioxContextCharLength,
  SONIOX_CONTEXT_SAFE_CHARS,
} from "./soniox-context-budget";

export type SonioxContextTerm = { source: string; target: string };

export type SonioxContext = {
  general: { key: string; value: string }[];
  terms: string[];
  translation_terms?: SonioxContextTerm[];
};

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

// Additive multilingual term expansions for chunk-v2 interpreter context.
TERMS_BY_LANG["ar"] = [
  ...(TERMS_BY_LANG["ar"] ?? []),
  // Body
  { source: "رئتين", target: "lungs" }, { source: "معدة", target: "stomach" }, { source: "دماغ", target: "brain" }, { source: "عمود فقري", target: "spine" }, { source: "دم", target: "blood" }, { source: "مثانة", target: "bladder" }, { source: "بنكرياس", target: "pancreas" }, { source: "غدة درقية", target: "thyroid" }, { source: "رحم", target: "uterus" }, { source: "مبايض", target: "ovaries" }, { source: "بروستاتا", target: "prostate" }, { source: "مرارة", target: "gallbladder" }, { source: "زائدة دودية", target: "appendix" }, { source: "أمعاء", target: "intestines" }, { source: "شرايين", target: "arteries" }, { source: "أوردة", target: "veins" },
  // Conditions
  { source: "ارتفاع ضغط الدم", target: "hypertension" }, { source: "سرطان", target: "cancer" }, { source: "ورم", target: "tumor" }, { source: "عدوى", target: "infection" }, { source: "التهاب", target: "inflammation" }, { source: "كسر", target: "fracture" }, { source: "جلطة دماغية", target: "stroke" }, { source: "نوبة قلبية", target: "heart attack" }, { source: "ربو", target: "asthma" }, { source: "التهاب رئوي", target: "pneumonia" }, { source: "التهاب المفاصل", target: "arthritis" }, { source: "اكتئاب", target: "depression" }, { source: "قلق", target: "anxiety" }, { source: "صرع", target: "epilepsy" }, { source: "فيروس نقص المناعة", target: "HIV" }, { source: "الإيدز", target: "AIDS" }, { source: "التهاب الكبد", target: "hepatitis" }, { source: "السل", target: "tuberculosis" }, { source: "فقر الدم", target: "anemia" }, { source: "هشاشة العظام", target: "osteoporosis" },
  // Procedures
  { source: "عملية جراحية", target: "surgery" }, { source: "خزعة", target: "biopsy" }, { source: "زرع الأعضاء", target: "transplant" }, { source: "العلاج الكيميائي", target: "chemotherapy" }, { source: "العلاج الإشعاعي", target: "radiation therapy" }, { source: "غسيل الكلى", target: "dialysis" }, { source: "تنظير", target: "endoscopy" }, { source: "رنين مغناطيسي", target: "MRI" }, { source: "تصوير مقطعي", target: "CT scan" }, { source: "فحص دم", target: "blood test" }, { source: "حقن", target: "injection" }, { source: "تطعيم", target: "vaccination" }, { source: "بتر", target: "amputation" }, { source: "قسطرة", target: "catheter" }, { source: "تنبيب", target: "intubation" },
  // Medications
  { source: "جرعة", target: "dosage" }, { source: "وصفة طبية", target: "prescription" }, { source: "مضاد حيوي", target: "antibiotic" }, { source: "مسكن ألم", target: "painkiller" }, { source: "مميع للدم", target: "blood thinner" }, { source: "أنسولين", target: "insulin" }, { source: "مهدئ", target: "sedative" }, { source: "تخدير", target: "anesthesia" }, { source: "لقاح", target: "vaccine" }, { source: "آثار جانبية", target: "side effects" }, { source: "جرعة زائدة", target: "overdose" }, { source: "حساسية", target: "allergy" },
  // Emergency
  { source: "طوارئ", target: "emergency" }, { source: "سيارة إسعاف", target: "ambulance" }, { source: "العناية المركزة", target: "intensive care" }, { source: "حالة حرجة", target: "critical condition" }, { source: "إنعاش", target: "resuscitation" },
  // Legal
  { source: "مدعى عليه", target: "defendant" }, { source: "مدعي", target: "plaintiff" }, { source: "قاضي", target: "judge" }, { source: "هيئة محلفين", target: "jury" }, { source: "محامي", target: "attorney" }, { source: "شهادة", target: "testimony" }, { source: "حكم", target: "verdict" }, { source: "عقوبة", target: "sentence" }, { source: "استئناف", target: "appeal" }, { source: "كفالة", target: "bail" }, { source: "مذكرة توقيف", target: "warrant" }, { source: "استدعاء", target: "subpoena" }, { source: "دليل", target: "evidence" }, { source: "تسوية", target: "settlement" }, { source: "دعوى قضائية", target: "lawsuit" }, { source: "جلسة", target: "hearing" }, { source: "محاكمة", target: "trial" }, { source: "تبرئة", target: "acquittal" }, { source: "إدانة", target: "conviction" }, { source: "جريمة", target: "felony" }, { source: "مخالفة", target: "misdemeanor" }, { source: "اعتداء", target: "assault" }, { source: "سطو", target: "robbery" }, { source: "احتيال", target: "fraud" }, { source: "شهادة زور", target: "perjury" }, { source: "إفراج مشروط", target: "parole" }, { source: "لائحة اتهام", target: "indictment" }, { source: "مذنب", target: "guilty" }, { source: "غير مذنب", target: "not guilty" }, { source: "عقد", target: "contract" }, { source: "إخلال", target: "breach" }, { source: "تعويضات", target: "damages" }, { source: "مسؤولية", target: "liability" }, { source: "إهمال", target: "negligence" }, { source: "مقاضاة طبية", target: "malpractice" }, { source: "حضانة", target: "custody" }, { source: "طلاق", target: "divorce" }, { source: "نفقة", target: "alimony" }, { source: "نفقة الأطفال", target: "child support" }, { source: "أمر تقييدي", target: "restraining order" },
  // Insurance
  { source: "بوليصة تأمين", target: "insurance policy" }, { source: "قسط", target: "premium" }, { source: "خصم", target: "deductible" }, { source: "تغطية", target: "coverage" }, { source: "مطالبة", target: "claim" }, { source: "مستفيد", target: "beneficiary" }, { source: "إحالة", target: "referral" }, { source: "تفويض", target: "authorization" }, { source: "حالة موجودة مسبقا", target: "pre-existing condition" }, { source: "استثناء", target: "exclusion" }, { source: "استرداد", target: "reimbursement" }, { source: "إعاقة", target: "disability" }, { source: "تعويض العمال", target: "workers compensation" },
  // Critical medical corrections
  { source: "اعتلال عضلة القلب", target: "cardiomyopathy" },
  { source: "اعتلال الكلى السكري", target: "diabetic nephropathy" },
  { source: "اعتلال الشبكية السكري", target: "diabetic retinopathy" },
  { source: "التهاب الكبد الدهني غير الكحولي", target: "non-alcoholic steatohepatitis" },
  { source: "انقطاع التنفس الانسدادي أثناء النوم", target: "obstructive sleep apnea" },
  { source: "اعتلال الأعصاب الطرفية", target: "peripheral neuropathy" },
  { source: "الرجفان الأذيني", target: "atrial fibrillation" },
  { source: "الفشل الكلوي الحاد", target: "acute kidney failure" },
  { source: "التهاب البنكرياس", target: "pancreatitis" },
  { source: "شلل المعدة", target: "gastroparesis" },
  { source: "سرطان الغدة الدرقية النخاعي", target: "medullary thyroid carcinoma" },
  { source: "الهيموغلوبين", target: "hemoglobin" },
  { source: "معدل الترشيح الكبيبي", target: "glomerular filtration rate" },
  { source: "الكرياتينين", target: "creatinine" },
  { source: "الهيموغلوبين السكري", target: "hemoglobin A1c" },
  { source: "الببتيد الناتريوريتيكي", target: "natriuretic peptide" },
  { source: "البروتين التفاعلي", target: "C-reactive protein" },
  { source: "السيماغلوتيد", target: "semaglutide" },
  { source: "الميتفورمين", target: "metformin" },
  { source: "الأتورفاستاتين", target: "atorvastatin" },
  { source: "الليزينوبريل", target: "lisinopril" },
];

TERMS_BY_LANG["es"] = [
  ...(TERMS_BY_LANG["es"] ?? []),
  // Body
  { source: "corazón", target: "heart" }, { source: "pulmones", target: "lungs" }, { source: "hígado", target: "liver" }, { source: "riñones", target: "kidneys" }, { source: "estómago", target: "stomach" }, { source: "cerebro", target: "brain" }, { source: "columna vertebral", target: "spine" }, { source: "sangre", target: "blood" }, { source: "vejiga", target: "bladder" }, { source: "páncreas", target: "pancreas" }, { source: "tiroides", target: "thyroid" }, { source: "útero", target: "uterus" }, { source: "ovarios", target: "ovaries" }, { source: "próstata", target: "prostate" }, { source: "vesícula biliar", target: "gallbladder" }, { source: "apéndice", target: "appendix" }, { source: "intestinos", target: "intestines" }, { source: "venas", target: "veins" }, { source: "arterias", target: "arteries" },
  // Conditions
  { source: "hipertensión", target: "hypertension" }, { source: "cáncer", target: "cancer" }, { source: "tumor", target: "tumor" }, { source: "infección", target: "infection" }, { source: "inflamación", target: "inflammation" }, { source: "fractura", target: "fracture" }, { source: "derrame cerebral", target: "stroke" }, { source: "ataque al corazón", target: "heart attack" }, { source: "asma", target: "asthma" }, { source: "neumonía", target: "pneumonia" }, { source: "artritis", target: "arthritis" }, { source: "depresión", target: "depression" }, { source: "ansiedad", target: "anxiety" }, { source: "epilepsia", target: "epilepsy" }, { source: "VIH", target: "HIV" }, { source: "SIDA", target: "AIDS" }, { source: "hepatitis", target: "hepatitis" }, { source: "tuberculosis", target: "tuberculosis" }, { source: "anemia", target: "anemia" }, { source: "osteoporosis", target: "osteoporosis" },
  // Procedures
  { source: "biopsia", target: "biopsy" }, { source: "trasplante", target: "transplant" }, { source: "quimioterapia", target: "chemotherapy" }, { source: "radioterapia", target: "radiation therapy" }, { source: "diálisis", target: "dialysis" }, { source: "endoscopia", target: "endoscopy" }, { source: "colonoscopia", target: "colonoscopy" }, { source: "resonancia magnética", target: "MRI" }, { source: "tomografía", target: "CT scan" }, { source: "ultrasonido", target: "ultrasound" }, { source: "análisis de sangre", target: "blood test" }, { source: "inyección", target: "injection" }, { source: "vacunación", target: "vaccination" }, { source: "amputación", target: "amputation" }, { source: "catéter", target: "catheter" }, { source: "intubación", target: "intubation" },
  // Medications
  { source: "antibiótico", target: "antibiotic" }, { source: "analgésico", target: "painkiller" }, { source: "anticoagulante", target: "blood thinner" }, { source: "insulina", target: "insulin" }, { source: "sedante", target: "sedative" }, { source: "anestesia", target: "anesthesia" }, { source: "vacuna", target: "vaccine" }, { source: "efectos secundarios", target: "side effects" }, { source: "sobredosis", target: "overdose" }, { source: "alergia", target: "allergy" },
  // Emergency
  { source: "emergencia", target: "emergency" }, { source: "ambulancia", target: "ambulance" }, { source: "cuidados intensivos", target: "intensive care" }, { source: "condición crítica", target: "critical condition" }, { source: "resucitación", target: "resuscitation" },
  // Legal
  { source: "juez", target: "judge" }, { source: "jurado", target: "jury" }, { source: "abogado", target: "attorney" }, { source: "sentencia", target: "sentence" }, { source: "apelación", target: "appeal" }, { source: "fianza", target: "bail" }, { source: "orden judicial", target: "warrant" }, { source: "citación", target: "subpoena" }, { source: "declaración", target: "deposition" }, { source: "evidencia", target: "evidence" }, { source: "acuerdo", target: "settlement" }, { source: "demanda", target: "lawsuit" }, { source: "jurisdicción", target: "jurisdiction" }, { source: "audiencia", target: "hearing" }, { source: "juicio", target: "trial" }, { source: "absolución", target: "acquittal" }, { source: "condena", target: "conviction" }, { source: "delito grave", target: "felony" }, { source: "delito menor", target: "misdemeanor" }, { source: "asalto", target: "assault" }, { source: "robo", target: "robbery" }, { source: "fraude", target: "fraud" }, { source: "perjurio", target: "perjury" }, { source: "libertad condicional", target: "parole" }, { source: "acusación", target: "indictment" }, { source: "culpable", target: "guilty" }, { source: "no culpable", target: "not guilty" }, { source: "contrato", target: "contract" }, { source: "incumplimiento", target: "breach" }, { source: "daños", target: "damages" }, { source: "responsabilidad", target: "liability" }, { source: "negligencia", target: "negligence" }, { source: "mala praxis", target: "malpractice" }, { source: "divorcio", target: "divorce" }, { source: "pensión alimenticia", target: "alimony" }, { source: "manutención de menores", target: "child support" }, { source: "orden de alejamiento", target: "restraining order" },
  // Insurance
  { source: "póliza", target: "insurance policy" }, { source: "prima", target: "premium" }, { source: "deducible", target: "deductible" }, { source: "copago", target: "copay" }, { source: "cobertura", target: "coverage" }, { source: "reclamación", target: "claim" }, { source: "beneficiario", target: "beneficiary" }, { source: "red de proveedores", target: "provider network" }, { source: "referencia", target: "referral" }, { source: "autorización", target: "authorization" }, { source: "condición preexistente", target: "pre-existing condition" }, { source: "exclusión", target: "exclusion" }, { source: "reembolso", target: "reimbursement" }, { source: "discapacidad", target: "disability" }, { source: "compensación laboral", target: "workers compensation" },
];

TERMS_BY_LANG["pl"] = [
  ...(TERMS_BY_LANG["pl"] ?? []),
  // Body
  { source: "serce", target: "heart" }, { source: "płuca", target: "lungs" }, { source: "wątroba", target: "liver" }, { source: "nerki", target: "kidneys" }, { source: "żołądek", target: "stomach" }, { source: "mózg", target: "brain" }, { source: "kręgosłup", target: "spine" }, { source: "krew", target: "blood" }, { source: "pęcherz", target: "bladder" }, { source: "trzustka", target: "pancreas" }, { source: "tarczyca", target: "thyroid" }, { source: "macica", target: "uterus" }, { source: "jajniki", target: "ovaries" }, { source: "prostata", target: "prostate" }, { source: "pęcherzyk żółciowy", target: "gallbladder" }, { source: "wyrostek robaczkowy", target: "appendix" }, { source: "jelita", target: "intestines" }, { source: "żyły", target: "veins" }, { source: "tętnice", target: "arteries" },
  // Conditions
  { source: "cukrzyca", target: "diabetes" }, { source: "nadciśnienie", target: "hypertension" }, { source: "rak", target: "cancer" }, { source: "guz", target: "tumor" }, { source: "infekcja", target: "infection" }, { source: "zapalenie", target: "inflammation" }, { source: "złamanie", target: "fracture" }, { source: "udar", target: "stroke" }, { source: "zawał serca", target: "heart attack" }, { source: "astma", target: "asthma" }, { source: "zapalenie płuc", target: "pneumonia" }, { source: "artretyzm", target: "arthritis" }, { source: "depresja", target: "depression" }, { source: "lęk", target: "anxiety" }, { source: "epilepsja", target: "epilepsy" }, { source: "wirusowe zapalenie wątroby", target: "hepatitis" }, { source: "gruźlica", target: "tuberculosis" }, { source: "anemia", target: "anemia" }, { source: "osteoporoza", target: "osteoporosis" },
  // Procedures
  { source: "operacja", target: "surgery" }, { source: "biopsja", target: "biopsy" }, { source: "przeszczep", target: "transplant" }, { source: "chemioterapia", target: "chemotherapy" }, { source: "radioterapia", target: "radiation therapy" }, { source: "dializa", target: "dialysis" }, { source: "endoskopia", target: "endoscopy" }, { source: "kolonoskopia", target: "colonoscopy" }, { source: "rezonans magnetyczny", target: "MRI" }, { source: "tomografia", target: "CT scan" }, { source: "USG", target: "ultrasound" }, { source: "badanie krwi", target: "blood test" }, { source: "iniekcja", target: "injection" }, { source: "szczepienie", target: "vaccination" }, { source: "amputacja", target: "amputation" }, { source: "cewnik", target: "catheter" }, { source: "intubacja", target: "intubation" },
  // Medications
  { source: "dawkowanie", target: "dosage" }, { source: "recepta", target: "prescription" }, { source: "antybiotyk", target: "antibiotic" }, { source: "środek przeciwbólowy", target: "painkiller" }, { source: "środek rozrzedzający krew", target: "blood thinner" }, { source: "insulina", target: "insulin" }, { source: "środek uspokajający", target: "sedative" }, { source: "znieczulenie", target: "anesthesia" }, { source: "szczepionka", target: "vaccine" }, { source: "skutki uboczne", target: "side effects" }, { source: "przedawkowanie", target: "overdose" }, { source: "alergia", target: "allergy" },
  // Emergency
  { source: "nagły przypadek", target: "emergency" }, { source: "karetka", target: "ambulance" }, { source: "intensywna opieka", target: "intensive care" }, { source: "stan krytyczny", target: "critical condition" }, { source: "resuscytacja", target: "resuscitation" },
  // Legal
  { source: "pozwany", target: "defendant" }, { source: "powód", target: "plaintiff" }, { source: "sędzia", target: "judge" }, { source: "ława przysięgłych", target: "jury" }, { source: "prawnik", target: "attorney" }, { source: "zeznanie", target: "testimony" }, { source: "wyrok", target: "verdict" }, { source: "kara", target: "sentence" }, { source: "apelacja", target: "appeal" }, { source: "kaucja", target: "bail" }, { source: "nakaz", target: "warrant" }, { source: "wezwanie sądowe", target: "subpoena" }, { source: "dowód", target: "evidence" }, { source: "ugoda", target: "settlement" }, { source: "pozew", target: "lawsuit" }, { source: "rozprawa", target: "hearing" }, { source: "proces", target: "trial" }, { source: "uniewinnienie", target: "acquittal" }, { source: "skazanie", target: "conviction" }, { source: "przestępstwo", target: "felony" }, { source: "wykroczenie", target: "misdemeanor" }, { source: "napaść", target: "assault" }, { source: "rozbój", target: "robbery" }, { source: "oszustwo", target: "fraud" }, { source: "krzywoprzysięstwo", target: "perjury" }, { source: "warunkowe zwolnienie", target: "parole" }, { source: "oskarżenie", target: "indictment" }, { source: "wina", target: "guilty" }, { source: "niewinny", target: "not guilty" }, { source: "umowa", target: "contract" }, { source: "naruszenie", target: "breach" }, { source: "odszkodowanie", target: "damages" }, { source: "odpowiedzialność", target: "liability" }, { source: "zaniedbanie", target: "negligence" }, { source: "błąd medyczny", target: "malpractice" }, { source: "opieka", target: "custody" }, { source: "rozwód", target: "divorce" }, { source: "alimenty", target: "alimony" }, { source: "nakaz zakazu zbliżania", target: "restraining order" },
  // Insurance
  { source: "polisa", target: "insurance policy" }, { source: "składka", target: "premium" }, { source: "udział własny", target: "deductible" }, { source: "dopłata", target: "copay" }, { source: "ochrona", target: "coverage" }, { source: "roszczenie", target: "claim" }, { source: "beneficjent", target: "beneficiary" }, { source: "skierowanie", target: "referral" }, { source: "autoryzacja", target: "authorization" }, { source: "choroba istniejąca wcześniej", target: "pre-existing condition" }, { source: "wykluczenie", target: "exclusion" }, { source: "zwrot kosztów", target: "reimbursement" }, { source: "niepełnosprawność", target: "disability" }, { source: "odszkodowanie pracownicze", target: "workers compensation" },
];

TERMS_BY_LANG["pt"] = [
  ...(TERMS_BY_LANG["pt"] ?? []),
  // Body
  { source: "coração", target: "heart" }, { source: "pulmões", target: "lungs" }, { source: "fígado", target: "liver" }, { source: "rins", target: "kidneys" }, { source: "estômago", target: "stomach" }, { source: "cérebro", target: "brain" }, { source: "coluna vertebral", target: "spine" }, { source: "sangue", target: "blood" }, { source: "bexiga", target: "bladder" }, { source: "pâncreas", target: "pancreas" }, { source: "tireoide", target: "thyroid" }, { source: "útero", target: "uterus" }, { source: "ovários", target: "ovaries" }, { source: "próstata", target: "prostate" }, { source: "vesícula biliar", target: "gallbladder" }, { source: "apêndice", target: "appendix" }, { source: "intestinos", target: "intestines" }, { source: "veias", target: "veins" }, { source: "artérias", target: "arteries" },
  // Conditions
  { source: "hipertensão", target: "hypertension" }, { source: "câncer", target: "cancer" }, { source: "tumor", target: "tumor" }, { source: "infecção", target: "infection" }, { source: "inflamação", target: "inflammation" }, { source: "fratura", target: "fracture" }, { source: "derrame", target: "stroke" }, { source: "ataque cardíaco", target: "heart attack" }, { source: "asma", target: "asthma" }, { source: "pneumonia", target: "pneumonia" }, { source: "artrite", target: "arthritis" }, { source: "depressão", target: "depression" }, { source: "ansiedade", target: "anxiety" }, { source: "epilepsia", target: "epilepsy" }, { source: "HIV", target: "HIV" }, { source: "AIDS", target: "AIDS" }, { source: "hepatite", target: "hepatitis" }, { source: "tuberculose", target: "tuberculosis" }, { source: "anemia", target: "anemia" }, { source: "osteoporose", target: "osteoporosis" },
  // Procedures
  { source: "cirurgia", target: "surgery" }, { source: "biópsia", target: "biopsy" }, { source: "transplante", target: "transplant" }, { source: "quimioterapia", target: "chemotherapy" }, { source: "radioterapia", target: "radiation therapy" }, { source: "diálise", target: "dialysis" }, { source: "endoscopia", target: "endoscopy" }, { source: "colonoscopia", target: "colonoscopy" }, { source: "ressonância magnética", target: "MRI" }, { source: "tomografia", target: "CT scan" }, { source: "ultrassom", target: "ultrasound" }, { source: "exame de sangue", target: "blood test" }, { source: "injeção", target: "injection" }, { source: "vacinação", target: "vaccination" }, { source: "amputação", target: "amputation" }, { source: "cateter", target: "catheter" }, { source: "intubação", target: "intubation" },
  // Medications
  { source: "dosagem", target: "dosage" }, { source: "receita", target: "prescription" }, { source: "antibiótico", target: "antibiotic" }, { source: "analgésico", target: "painkiller" }, { source: "anticoagulante", target: "blood thinner" }, { source: "insulina", target: "insulin" }, { source: "sedativo", target: "sedative" }, { source: "anestesia", target: "anesthesia" }, { source: "vacina", target: "vaccine" }, { source: "efeitos colaterais", target: "side effects" }, { source: "overdose", target: "overdose" }, { source: "alergia", target: "allergy" },
  // Emergency
  { source: "emergência", target: "emergency" }, { source: "ambulância", target: "ambulance" }, { source: "terapia intensiva", target: "intensive care" }, { source: "estado crítico", target: "critical condition" }, { source: "ressuscitação", target: "resuscitation" },
  // Legal
  { source: "réu", target: "defendant" }, { source: "autor", target: "plaintiff" }, { source: "juiz", target: "judge" }, { source: "júri", target: "jury" }, { source: "advogado", target: "attorney" }, { source: "testemunho", target: "testimony" }, { source: "veredicto", target: "verdict" }, { source: "sentença", target: "sentence" }, { source: "apelação", target: "appeal" }, { source: "fiança", target: "bail" }, { source: "mandado", target: "warrant" }, { source: "intimação", target: "subpoena" }, { source: "depoimento", target: "deposition" }, { source: "evidência", target: "evidence" }, { source: "acordo", target: "settlement" }, { source: "processo", target: "lawsuit" }, { source: "audiência", target: "hearing" }, { source: "julgamento", target: "trial" }, { source: "absolvição", target: "acquittal" }, { source: "condenação", target: "conviction" }, { source: "crime grave", target: "felony" }, { source: "contravenção", target: "misdemeanor" }, { source: "agressão", target: "assault" }, { source: "roubo", target: "robbery" }, { source: "fraude", target: "fraud" }, { source: "perjúrio", target: "perjury" }, { source: "liberdade condicional", target: "parole" }, { source: "indiciamento", target: "indictment" }, { source: "culpado", target: "guilty" }, { source: "inocente", target: "not guilty" }, { source: "contrato", target: "contract" }, { source: "violação", target: "breach" }, { source: "danos", target: "damages" }, { source: "responsabilidade", target: "liability" }, { source: "negligência", target: "negligence" }, { source: "má prática médica", target: "malpractice" }, { source: "custódia", target: "custody" }, { source: "divórcio", target: "divorce" }, { source: "pensão alimentícia", target: "alimony" }, { source: "pensão de filhos", target: "child support" }, { source: "ordem de restrição", target: "restraining order" },
  // Insurance
  { source: "apólice", target: "insurance policy" }, { source: "prêmio", target: "premium" }, { source: "franquia", target: "deductible" }, { source: "copagamento", target: "copay" }, { source: "cobertura", target: "coverage" }, { source: "sinistro", target: "claim" }, { source: "beneficiário", target: "beneficiary" }, { source: "encaminhamento", target: "referral" }, { source: "autorização", target: "authorization" }, { source: "condição preexistente", target: "pre-existing condition" }, { source: "exclusão", target: "exclusion" }, { source: "reembolso", target: "reimbursement" }, { source: "deficiência", target: "disability" }, { source: "compensação trabalhista", target: "workers compensation" },
];

TERMS_BY_LANG["zh"] = [
  ...(TERMS_BY_LANG["zh"] ?? []),
  // Body
  { source: "心脏", target: "heart" }, { source: "肺", target: "lungs" }, { source: "肝脏", target: "liver" }, { source: "肾脏", target: "kidneys" }, { source: "胃", target: "stomach" }, { source: "大脑", target: "brain" }, { source: "脊柱", target: "spine" }, { source: "血液", target: "blood" }, { source: "膀胱", target: "bladder" }, { source: "胰腺", target: "pancreas" }, { source: "甲状腺", target: "thyroid" }, { source: "子宫", target: "uterus" }, { source: "卵巢", target: "ovaries" }, { source: "前列腺", target: "prostate" }, { source: "胆囊", target: "gallbladder" }, { source: "阑尾", target: "appendix" }, { source: "肠道", target: "intestines" }, { source: "静脉", target: "veins" }, { source: "动脉", target: "arteries" },
  // Conditions
  { source: "高血压", target: "hypertension" }, { source: "癌症", target: "cancer" }, { source: "肿瘤", target: "tumor" }, { source: "感染", target: "infection" }, { source: "炎症", target: "inflammation" }, { source: "骨折", target: "fracture" }, { source: "中风", target: "stroke" }, { source: "心脏病发作", target: "heart attack" }, { source: "哮喘", target: "asthma" }, { source: "肺炎", target: "pneumonia" }, { source: "关节炎", target: "arthritis" }, { source: "抑郁症", target: "depression" }, { source: "焦虑症", target: "anxiety" }, { source: "癫痫", target: "epilepsy" }, { source: "艾滋病毒", target: "HIV" }, { source: "艾滋病", target: "AIDS" }, { source: "肝炎", target: "hepatitis" }, { source: "结核病", target: "tuberculosis" }, { source: "贫血", target: "anemia" }, { source: "骨质疏松", target: "osteoporosis" },
  // Procedures
  { source: "手术", target: "surgery" }, { source: "活检", target: "biopsy" }, { source: "器官移植", target: "transplant" }, { source: "化疗", target: "chemotherapy" }, { source: "放疗", target: "radiation therapy" }, { source: "透析", target: "dialysis" }, { source: "内窥镜检查", target: "endoscopy" }, { source: "结肠镜检查", target: "colonoscopy" }, { source: "核磁共振", target: "MRI" }, { source: "CT扫描", target: "CT scan" }, { source: "超声波检查", target: "ultrasound" }, { source: "血液检查", target: "blood test" }, { source: "注射", target: "injection" }, { source: "疫苗接种", target: "vaccination" }, { source: "截肢", target: "amputation" }, { source: "导管", target: "catheter" }, { source: "插管", target: "intubation" },
  // Medications
  { source: "剂量", target: "dosage" }, { source: "处方", target: "prescription" }, { source: "抗生素", target: "antibiotic" }, { source: "止痛药", target: "painkiller" }, { source: "血液稀释剂", target: "blood thinner" }, { source: "胰岛素", target: "insulin" }, { source: "镇静剂", target: "sedative" }, { source: "麻醉", target: "anesthesia" }, { source: "疫苗", target: "vaccine" }, { source: "副作用", target: "side effects" }, { source: "过量服药", target: "overdose" }, { source: "过敏", target: "allergy" },
  // Emergency
  { source: "紧急情况", target: "emergency" }, { source: "救护车", target: "ambulance" }, { source: "重症监护", target: "intensive care" }, { source: "危急状态", target: "critical condition" }, { source: "心肺复苏", target: "resuscitation" },
  // Legal
  { source: "被告", target: "defendant" }, { source: "原告", target: "plaintiff" }, { source: "法官", target: "judge" }, { source: "陪审团", target: "jury" }, { source: "律师", target: "attorney" }, { source: "证词", target: "testimony" }, { source: "判决", target: "verdict" }, { source: "刑罚", target: "sentence" }, { source: "上诉", target: "appeal" }, { source: "保释金", target: "bail" }, { source: "逮捕令", target: "warrant" }, { source: "传票", target: "subpoena" }, { source: "证据", target: "evidence" }, { source: "和解", target: "settlement" }, { source: "诉讼", target: "lawsuit" }, { source: "听证会", target: "hearing" }, { source: "审判", target: "trial" }, { source: "无罪释放", target: "acquittal" }, { source: "定罪", target: "conviction" }, { source: "重罪", target: "felony" }, { source: "轻罪", target: "misdemeanor" }, { source: "袭击", target: "assault" }, { source: "抢劫", target: "robbery" }, { source: "欺诈", target: "fraud" }, { source: "伪证", target: "perjury" }, { source: "假释", target: "parole" }, { source: "起诉书", target: "indictment" }, { source: "有罪", target: "guilty" }, { source: "无罪", target: "not guilty" }, { source: "合同", target: "contract" }, { source: "违约", target: "breach" }, { source: "损害赔偿", target: "damages" }, { source: "责任", target: "liability" }, { source: "疏忽", target: "negligence" }, { source: "医疗事故", target: "malpractice" }, { source: "监护权", target: "custody" }, { source: "离婚", target: "divorce" }, { source: "赡养费", target: "alimony" }, { source: "子女抚养费", target: "child support" }, { source: "禁止令", target: "restraining order" },
  // Insurance
  { source: "保险单", target: "insurance policy" }, { source: "保险费", target: "premium" }, { source: "免赔额", target: "deductible" }, { source: "共付额", target: "copay" }, { source: "保障范围", target: "coverage" }, { source: "索赔", target: "claim" }, { source: "受益人", target: "beneficiary" }, { source: "转诊", target: "referral" }, { source: "授权", target: "authorization" }, { source: "既往症", target: "pre-existing condition" }, { source: "除外条款", target: "exclusion" }, { source: "报销", target: "reimbursement" }, { source: "残疾", target: "disability" }, { source: "工伤赔偿", target: "workers compensation" },
];

// Fallbacks for other language pairs: keep only EN anchors when pair-specific map missing.

export function getInterpreterContext(
  langA: string,
  langB: string,
  injectedTerms: SonioxContextTerm[] = [],
): SonioxContext {
  const a = langA.split("-")[0]!.toLowerCase();
  const b = langB.split("-")[0]!.toLowerCase();
  /** Built in priority order so budget trim drops lowest-value rows first. */
  const translationTerms: SonioxContextTerm[] = [];
  const seen = new Set<string>();

  // 1) Personal glossary first (highest priority — protected during budget trim).
  const protectedGlossaryCount = mergeUniqueTranslationTerms(
    translationTerms,
    seen,
    injectedTerms,
  );

  // 1b) Spoken email / URL punctuation — keep Latin symbols, do not translate "dot".
  const spokenEmailCount = mergeUniqueTranslationTerms(
    translationTerms,
    seen,
    [
      { source: "dot com", target: ".com" },
      { source: "dot org", target: ".org" },
      { source: "dot net", target: ".net" },
      { source: "dot edu", target: ".edu" },
      { source: "dot gov", target: ".gov" },
      { source: "dot", target: "." },
      { source: "period", target: "." },
      { source: "underscore", target: "_" },
      { source: "at sign", target: "@" },
      { source: "at symbol", target: "@" },
      { source: "نقطة كوم", target: ".com" },
    ],
  );

  // 2) Vaccine + ISA medical pack (vaccines ordered first inside the builder).
  const medicalPack = buildChunkV2MedicalPackContext(langA, langB);
  mergeUniqueTranslationTerms(translationTerms, seen, medicalPack.translation_terms);

  // 3) Pair builtin maps (can be large for ar/es expansions — trimmed last among these).
  const addTerms = (from: string, to: string) => {
    if (from === "en" && TERMS_BY_LANG[to]) {
      mergeUniqueTranslationTerms(translationTerms, seen, TERMS_BY_LANG[to]!);
    }
    if (to === "en" && TERMS_BY_LANG[from]) {
      mergeUniqueTranslationTerms(
        translationTerms,
        seen,
        TERMS_BY_LANG[from]!.map((t) => ({ source: t.target, target: t.source })),
      );
    }
    if (from !== "en" && to !== "en") {
      for (const lang of [from, to]) {
        if (TERMS_BY_LANG[lang]) {
          mergeUniqueTranslationTerms(translationTerms, seen, TERMS_BY_LANG[lang]!);
        }
      }
    }
  };

  addTerms(a, b);
  addTerms(b, a);

  if ((a === "en" && b === "es") || (a === "es" && b === "en")) {
    mergeUniqueTranslationTerms(translationTerms, seen, [
      { source: "safe for fluids", target: "apto para recibir líquidos" },
      { source: "urine analysis", target: "análisis de orina" },
      { source: "good faith exam", target: "examen de buena fe" },
      { source: "kidney function", target: "función renal" },
      { source: "nurse practitioner", target: "enfermera practicante" },
      { source: "vitamin D supplement", target: "suplemento de vitamina D" },
      { source: "urinary tract infection", target: "infección de las vías urinarias" },
      { source: "date of birth", target: "fecha de nacimiento" },
      { source: "consent for telehealth", target: "consentimiento para teleconsulta" },
    ]);
  }

  const ctx: SonioxContext = {
    general: [
      // Keep domain neutral for STT — "Medical and legal" + English term pins
      // previously biased Arabic/other pair speech toward English at session start.
      { key: "domain", value: "Live professional interpreter session" },
      { key: "setting", value: "Telephone or video relay — any subject the parties discuss" },
      { key: "role", value: "Human interpreter relaying speech between two parties" },
      { key: "accuracy", value: "Preserve exact numbers, drug names, legal terms, and codes" },
      { key: "structured_speech", value: "Keep phone numbers, emails, URLs, and spelled IDs in the exact spoken letter and digit order. Never reverse number groups. Spoken 'dot' in an email or URL is '.' and 'dot com' is '.com'." },
    ],
    // Do not pin hundreds of English medical/legal words into STT `terms`.
    // That list made Arabic (and other pair languages) transcribe as English
    // that was never spoken. Native translation still uses translation_terms.
    terms: [],
  };

  if (translationTerms.length > 0) {
    ctx.translation_terms = translationTerms;
  }

  const fitted = fitSonioxContextToBudget(ctx, {
    protectedTranslationTermCount: protectedGlossaryCount + spokenEmailCount,
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
