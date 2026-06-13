/** Ch1–2 demo script only — product demonstration, not sales copy. */
export type CinematicTurn = {
  id: string;
  speaker: "doctor" | "patient";
  spokenLang: "EN" | "ES";
  /** What appears in the original column */
  original: string;
  /** Translation shown for the other party */
  translation: string;
  /** Who receives the translation */
  translationFor: "doctor" | "patient";
  stripe: "blue" | "amber";
};

export const CINEMATIC_MARIA_DIALOGUE: readonly CinematicTurn[] = [
  {
    id: "t1",
    speaker: "doctor",
    spokenLang: "EN",
    original: "Good morning Maria. Before we begin, can you tell me when the symptoms first started?",
    translation: "Buenos días María. Antes de comenzar, ¿puede decirme cuándo comenzaron los síntomas?",
    translationFor: "patient",
    stripe: "blue",
  },
  {
    id: "t2",
    speaker: "patient",
    spokenLang: "ES",
    original: "Comenzaron hace aproximadamente tres semanas y han empeorado gradualmente.",
    translation: "They started approximately three weeks ago and have gradually become worse.",
    translationFor: "doctor",
    stripe: "amber",
  },
  {
    id: "t3",
    speaker: "doctor",
    spokenLang: "EN",
    original: "On a scale from one to ten, how severe is the pain?",
    translation: "En una escala del uno al diez, ¿qué tan severo es el dolor?",
    translationFor: "patient",
    stripe: "blue",
  },
  {
    id: "t4",
    speaker: "patient",
    spokenLang: "ES",
    original: "Diría que alrededor de siete.",
    translation: "I would say around seven.",
    translationFor: "doctor",
    stripe: "amber",
  },
];
