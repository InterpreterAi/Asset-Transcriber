/** Illustrative medical-session lines — same honest demo wording as the product preview. */
export type MarketingDialogueLine = {
  id: string;
  spokenLang: "EN" | "ES";
  original: string;
  translation: string;
  stripe: "blue" | "amber";
  translationDir?: "ltr" | "rtl";
};

export const MEDICAL_DIALOGUE: MarketingDialogueLine[] = [
  {
    id: "m1",
    spokenLang: "EN",
    original: "Good morning, how can I help you today?",
    translation: "Buenos días, ¿cómo puedo ayudarle hoy?",
    stripe: "blue",
  },
  {
    id: "m2",
    spokenLang: "ES",
    original: "Necesito programar una cita de seguimiento.",
    translation: "I need to schedule a follow-up appointment.",
    stripe: "amber",
  },
  {
    id: "m3",
    spokenLang: "EN",
    original: "The rotator cuff requires physical therapy.",
    translation: "El manguito rotador requiere fisioterapia.",
    stripe: "blue",
  },
  {
    id: "m4",
    spokenLang: "ES",
    original: "¿Puedo ver a un especialista esta semana?",
    translation: "Can I see a specialist this week?",
    stripe: "amber",
  },
];

export const LEGAL_DIALOGUE: MarketingDialogueLine[] = [
  {
    id: "l1",
    spokenLang: "EN",
    original: "Please describe what happened on the date in question.",
    translation: "Por favor describa lo que ocurrió en la fecha en cuestión.",
    stripe: "blue",
  },
  {
    id: "l2",
    spokenLang: "ES",
    original: "Firmé el contrato sin entender todas las cláusulas.",
    translation: "I signed the contract without understanding all the clauses.",
    stripe: "amber",
  },
  {
    id: "l3",
    spokenLang: "EN",
    original: "We will review the plaintiff's documentation next.",
    translation: "Revisaremos la documentación del demandante a continuación.",
    stripe: "blue",
  },
];
