/** Domain lower-third titles for every official demo scenario. */
export const LOWER_THIRD_PRESETS = {
  medical: "Medical Interpretation",
  legal: "Legal Interpretation",
  insurance: "Insurance",
  emergency911: "911 Emergency",
  pharmacy: "Pharmacy",
  hospital: "Hospital",
  mentalHealth: "Mental Health",
  immigration: "Immigration",
  banking: "Banking",
  travel: "Travel",
} as const;

export type LowerThirdPresetKey = keyof typeof LOWER_THIRD_PRESETS;

export const LOWER_THIRD_PRESET_LIST = Object.entries(LOWER_THIRD_PRESETS).map(
  ([key, title]) => ({ key: key as LowerThirdPresetKey, title }),
);
