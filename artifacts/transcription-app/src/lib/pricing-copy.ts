/**
 * Pricing copy shared by the public landing page and the in-app upgrade modal.
 * Keep wording identical when updating either surface.
 */

export const PRICING_SHARED_FEATURES_SECTION_TITLE = "Core functionality";

export const PRICING_SHARED_FEATURES: readonly string[] = [
  "Real-time transcription",
  "Live translation between selected language pairs",
  "Speaker identification",
  "Tab audio capture",
  "Personal glossary support",
  "31+ supported languages",
];

export type PricingPlanKey = "basic" | "professional" | "unlimited";

export type PricingPlanDefinition = {
  key: PricingPlanKey;
  name: string;
  /** e.g. "$39" — combined with "/mo" where shown */
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
    priceLabel: "$39",
    priceAmount: 39,
    tagline: "For occasional interpreting sessions",
    highlight: false,
    features: [
      "All core features included",
      "Up to 3 hours of interpreting per day",
      "Select one language pair per session",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    priceLabel: "$69",
    priceAmount: 69,
    tagline: "Best for interpreters working daily",
    highlight: true,
    features: [
      "All core features included",
      "Up to 6 hours of interpreting per day",
      "Select one language pair per session",
    ],
  },
  {
    key: "unlimited",
    name: "Unlimited",
    priceLabel: "$99",
    priceAmount: 99,
    tagline: "For professional full-day interpreting",
    highlight: false,
    features: [
      "All core features included",
      "Unlimited interpreting hours",
      "Freely choose any language pair (A ↔ B) at any time",
    ],
  },
];
