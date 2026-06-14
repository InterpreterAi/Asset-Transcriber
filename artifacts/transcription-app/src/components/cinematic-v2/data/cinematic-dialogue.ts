/** Live demo script — professional medical EN↔ES session (Mr. Reyes). */
export type CinematicTurn = {
  id: string;
  speaker: "doctor" | "patient";
  spokenLang: "EN" | "ES";
  original: string;
  translation: string;
  translationFor: "doctor" | "patient";
  stripe: "blue" | "amber";
};

export const CINEMATIC_REYES_DIALOGUE: readonly CinematicTurn[] = [
  {
    id: "r1",
    speaker: "doctor",
    spokenLang: "EN",
    original:
      "Good morning, Mr. Reyes. After reviewing your echocardiogram, electrocardiogram, and comprehensive metabolic panel, I am concerned about possible cardiomyopathy, uncontrolled hypertension, dyslipidemia, and early-stage diabetic nephropathy. Your hemoglobin A1c is 9.4%, estimated glomerular filtration rate is 58 mL/min per 1.73 m², creatinine is 1.6 mg/dL, and urine microalbumin-to-creatinine ratio is significantly elevated. The differential diagnosis includes congestive heart failure, ischemic cardiomyopathy, hypertensive heart disease, and microvascular complications secondary to long-standing type 2 diabetes mellitus. I would like to order a transthoracic echocardiogram, coronary computed tomography angiography, ambulatory Holter monitoring, and a comprehensive ophthalmologic evaluation.",
    translation:
      "Buenos días, Sr. Reyes. Después de revisar su ecocardiograma, electrocardiograma y panel metabólico completo, estoy preocupada por posible cardiomiopatía, hipertensión no controlada, dislipidemia y nefropatía diabética en etapa temprana. Su hemoglobina A1c es 9.4%, la tasa de filtración glomerular estimada es de 58 mL/min por 1.73 m², la creatinina es de 1.6 mg/dL, y la relación microalbúmina-creatinina en orina está significativamente elevada. El diagnóstico diferencial incluye insuficiencia cardíaca congestiva, cardiomiopatía isquémica, enfermedad cardíaca hipertensiva y complicaciones microvasculares secundarias a diabetes mellitus tipo 2 de larga duración. Me gustaría ordenar un ecocardiograma transtorácico, una angiografía por tomografía computarizada coronaria, un monitoreo Holter ambulatorio y una evaluación oftalmológica completa.",
    translationFor: "patient",
    stripe: "blue",
  },
  {
    id: "r2",
    speaker: "patient",
    spokenLang: "ES",
    original:
      "Entiendo, doctora. Durante las últimas seis semanas he tenido disnea de esfuerzo, ortopnea, episodios ocasionales de palpitaciones, parestesias en ambas extremidades inferiores y fatiga progresiva. También he notado edema bilateral en los tobillos, especialmente al final del día. Mi padre tenía insuficiencia cardíaca congestiva con fibrilación auricular y enfermedad arterial coronaria. Además, recientemente me realizaron una colonoscopia, una endoscopia gastrointestinal superior y una resonancia magnética porque sospechaban enfermedad inflamatoria intestinal.",
    translation:
      "I understand, doctor. For the last six weeks, I have had exertional dyspnea, orthopnea, occasional episodes of palpitations, paresthesias in both lower extremities, and progressive fatigue. I have also noticed bilateral edema in the ankles, especially at the end of the day. My father had congestive heart failure with atrial fibrillation and coronary artery disease. Additionally, I recently had a colonoscopy, an upper gastrointestinal endoscopy, and an MRI because they suspected inflammatory bowel disease.",
    translationFor: "doctor",
    stripe: "amber",
  },
  {
    id: "r3",
    speaker: "doctor",
    spokenLang: "EN",
    original:
      "Thank you for providing that history. Given your symptoms, I am also concerned about peripheral neuropathy, diabetic retinopathy, obstructive sleep apnea, and possible non-alcoholic steatohepatitis. I recommend initiating semaglutide 0.25 mg weekly while continuing metformin, atorvastatin, and lisinopril. Laboratory testing should include thyroid-stimulating hormone, B-type natriuretic peptide, C-reactive protein, erythrocyte sedimentation rate, serum ferritin, vitamin B12, folate, and antinuclear antibody screening. Please send all prior records to cardiology.referrals@riversidemed.org and call 1-800-742-9911 extension 246 if symptoms worsen.",
    translation:
      "Gracias por proporcionar esa historia. Dados sus síntomas, también estoy preocupada por neuropatía periférica, retinopatía diabética, apnea obstructiva del sueño y posible esteatohepatitis no alcohólica. Recomiendo iniciar semaglutida 0.25 mg semanalmente mientras continúa con metformina, atorvastatina y lisinopril. Las pruebas de laboratorio deben incluir hormona estimulante de tiroides, péptido natriurético tipo B, proteína C-reactiva, velocidad de sedimentación globular, ferritina sérica, vitamina B12, folato y cribado de anticuerpos antinucleares. Envíe todos los registros previos a cardiology.referrals@riversidemed.org y llame al 1-800-742-9911 extensión 246 si los síntomas empeoran.",
    translationFor: "patient",
    stripe: "blue",
  },
  {
    id: "r4",
    speaker: "patient",
    spokenLang: "ES",
    original:
      "Gracias, doctora. Quiero confirmar que entendí correctamente: ¿existe riesgo de pancreatitis, gastroparesia, colecistitis, insuficiencia renal aguda o carcinoma medular de tiroides con la semaglutida? Además, si mi disnea empeora o presento dolor torácico, síncope, hemoptisis, taquicardia persistente o disminución del nivel de conciencia, ¿debo acudir inmediatamente al departamento de emergencias? Mi correo electrónico es miguel.rodriguez1978@outlook.com y mi número de teléfono es 602-555-9147.",
    translation:
      "Thank you, doctor. I want to confirm that I understood correctly: is there a risk of pancreatitis, gastroparesis, cholecystitis, acute renal failure, or medullary thyroid carcinoma with semaglutide? Also, if my dyspnea worsens or I develop chest pain, syncope, hemoptysis, persistent tachycardia, or decreased level of consciousness, should I go immediately to the emergency department? My email is miguel.rodriguez1978@outlook.com and my phone number is 602-555-9147.",
    translationFor: "doctor",
    stripe: "amber",
  },
];

/** Primary cinematic demo dialogue. */
export const CINEMATIC_DIALOGUE = CINEMATIC_REYES_DIALOGUE;

/** @deprecated Use {@link CINEMATIC_DIALOGUE}. */
export const CINEMATIC_MARIA_DIALOGUE = CINEMATIC_DIALOGUE;
