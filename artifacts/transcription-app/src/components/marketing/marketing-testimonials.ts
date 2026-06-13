/** Curated public testimonials — no user identifiers. */
export type MarketingTestimonial = { stars: 4 | 5; quote: string };

export type EnrichedTestimonial = MarketingTestimonial & {
  feature: string;
  replayLine: number;
};

export const MARKETING_TESTIMONIALS: readonly MarketingTestimonial[] = [
  { stars: 5, quote: "Reliable support during fast-paced interpretation sessions." },
  { stars: 5, quote: "Very useful for long bilingual calls." },
  { stars: 5, quote: "Helpful tool for OPI interpretation workflows." },
  { stars: 5, quote: "Improved my ability to follow rapid conversations." },
  { stars: 5, quote: "Useful for medical interpretation sessions." },
  { stars: 5, quote: "Simple, clean, and effective during remote calls." },
  { stars: 5, quote: "Helpful for terminology and live captions." },
  { stars: 4, quote: "Team continues improving speed and translation quality." },
  { stars: 4, quote: "Useful support tool during long sessions." },
  { stars: 5, quote: "Professional interface and easy workflow." },
  { stars: 5, quote: "Reliable real-time support during VRI calls." },
  { stars: 5, quote: "Very helpful during multilingual meetings." },
  { stars: 4, quote: "Translation accuracy has improved significantly." },
  { stars: 5, quote: "Excellent support for remote interpreting." },
  { stars: 4, quote: "Helpful for following difficult conversations." },
];

export const MARKETING_TESTIMONIALS_ENRICHED: readonly EnrichedTestimonial[] = [
  { stars: 5, quote: "Helpful tool for OPI interpretation workflows.", feature: "OPI", replayLine: 0 },
  { stars: 5, quote: "Reliable real-time support during VRI calls.", feature: "VRI", replayLine: 1 },
  { stars: 5, quote: "Improved my ability to follow rapid conversations.", feature: "Live captions", replayLine: 0 },
  { stars: 5, quote: "Useful for medical interpretation sessions.", feature: "Medical workflows", replayLine: 0 },
  { stars: 5, quote: "Professional interface and easy workflow.", feature: "Interpreter workflow", replayLine: 2 },
  { stars: 4, quote: "Translation accuracy has improved significantly.", feature: "Translation assist", replayLine: 1 },
  { stars: 5, quote: "Very useful for long bilingual calls.", feature: "Bilingual sessions", replayLine: 2 },
  { stars: 5, quote: "Simple, clean, and effective during remote calls.", feature: "Remote interpreting", replayLine: 3 },
];
