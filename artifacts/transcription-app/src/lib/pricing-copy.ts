/**
 * Pricing copy shared by the public landing page and the in-app upgrade modal.
 * Keep wording identical when updating either surface.
 */

export const PRICING_SHARED_FEATURES_SECTION_TITLE = "Core features";

export const PRICING_SHARED_FEATURES: readonly string[] = [
  "Real-time transcription",
  "Speaker identification",
  "Tab audio capture",
  "Personal glossary support",
  "31+ supported languages",
];

export type PricingPlanKey = "basic" | "professional" | "platinum";

export type PricingPlanDefinition = {
  key: PricingPlanKey;
  name: string;
  /** e.g. "$59" — combined with "/mo" where shown */
  priceLabel: string;
  priceAmount: number;
  tagline: string;
  highlight: boolean;
  features: readonly string[];
};

export const PRICING_PLANS: readonly PricingPlanDefinition[] = [
  {
    key: "basic",
    name: "Basic",
    priceLabel: "$59",
    priceAmount: 59,
    tagline: "For occasional interpreting sessions",
    highlight: false,
    features: [
      "All core features included",
      "Up to 5 hours of interpreting per day",
      "Real-time transcription",
      "Speaker identification",
      "Tab audio capture",
      "Personal glossary support",
      "31+ supported languages",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    priceLabel: "$99",
    priceAmount: 99,
    tagline: "Best for interpreters working daily",
    highlight: true,
    features: [
      "All core features included",
      "Unlimited interpreting hours",
      "Real-time transcription",
      "Speaker identification",
      "Tab audio capture",
      "Personal glossary support",
      "31+ supported languages",
    ],
  },
  {
    key: "platinum",
    name: "Platinum",
    priceLabel: "$179",
    priceAmount: 179,
    tagline: "For professional full-day interpreting",
    highlight: false,
    features: [
      "All core features included",
      "Unlimited interpreting hours",
      "Real-time transcription",
      "InterpreterAI Translation",
      "Speaker identification",
      "Tab audio capture",
      "Personal glossary support",
      "31+ supported languages",
    ],
  },
];
