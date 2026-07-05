/**
 * Pricing copy shared by the public landing page and the in-app upgrade modal.
 */

import { WORKSPACE_LANGUAGE_COUNT } from "./workspace-languages";

export const SUPPORTED_LANGUAGES_FEATURE = `${WORKSPACE_LANGUAGE_COUNT}+ supported languages`;

export const PRICING_SHARED_FEATURES_SECTION_TITLE = "Core features";

export const PRICING_SHARED_FEATURES: readonly string[] = [
  "Real-time transcription",
  "Speaker identification",
  "Tab audio capture",
  "Personal glossary support",
  SUPPORTED_LANGUAGES_FEATURE,
];

export type PricingPlanKey = "basic" | "professional" | "platinum";

export type PricingPlanDefinition = {
  key: PricingPlanKey;
  name: string;
  priceLabel: string;
  priceAmount: number;
  tagline: string;
  highlight: boolean;
  features: readonly string[];
};

export const PRICING_COMPARISON_ROWS: readonly { label: string; basic: string; professional: string; platinum: string }[] = [
  { label: "Best for", basic: "Periodic sessions", professional: "Daily practice", platinum: "Full-day workflows" },
  { label: "Daily platform time", basic: "Up to 5 hours", professional: "Generous daily allowance", platinum: "Generous daily allowance" },
  { label: "OPI & VRI-style workflows", basic: "Included", professional: "Included", platinum: "Included" },
  { label: "Real-time transcription", basic: "Yes", professional: "Yes", platinum: "Yes" },
  { label: "Professional InterpreterAI translation", basic: "—", professional: "—", platinum: "Yes" },
  { label: "Speaker separation", basic: "Yes", professional: "Yes", platinum: "Yes" },
  { label: "Tab audio capture", basic: "Yes", professional: "Yes", platinum: "Yes" },
  { label: "Personal glossary", basic: "Yes", professional: "Yes", platinum: "Yes" },
];

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
      SUPPORTED_LANGUAGES_FEATURE,
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
      SUPPORTED_LANGUAGES_FEATURE,
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
      "Professional InterpreterAI translation",
      "Speaker identification",
      "Tab audio capture",
      "Personal glossary support",
      SUPPORTED_LANGUAGES_FEATURE,
    ],
  },
];
