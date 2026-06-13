/** Curated public testimonials — no user identifiers. */
export type MarketingTestimonial = { stars: 4 | 5; quote: string };

export type EnrichedTestimonial = MarketingTestimonial & {
  feature: string;
  replayLine: number;
  role?: string;
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
  {
    stars: 5,
    quote: "Helpful tool for OPI interpretation workflows—I can follow fast callers without losing the thread.",
    feature: "OPI",
    role: "Spanish–English remote interpreter",
    replayLine: 0,
  },
  {
    stars: 5,
    quote: "Reliable real-time support during VRI calls. The side-by-side layout matches how I actually work.",
    feature: "VRI",
    role: "Medical VRI interpreter",
    replayLine: 1,
  },
  {
    stars: 5,
    quote: "Improved my ability to follow rapid conversations during agency shifts.",
    feature: "Live captions",
    role: "Contract interpreter",
    replayLine: 0,
  },
  {
    stars: 5,
    quote: "Useful for medical interpretation sessions when terminology comes quickly.",
    feature: "Medical workflows",
    role: "Healthcare interpreter",
    replayLine: 0,
  },
  {
    stars: 5,
    quote: "Professional interface and easy workflow—I spend less energy on note-taking.",
    feature: "Interpreter workflow",
    role: "Freelance interpreter",
    replayLine: 2,
  },
  {
    stars: 4,
    quote: "Translation accuracy has improved significantly over the last few months.",
    feature: "Translation assist",
    role: "Bilingual call specialist",
    replayLine: 1,
  },
  {
    stars: 5,
    quote: "Very useful for long bilingual calls where fatigue usually sets in after an hour.",
    feature: "Bilingual sessions",
    role: "OPI interpreter",
    replayLine: 2,
  },
  {
    stars: 5,
    quote: "Simple, clean, and effective during remote calls—no clutter on screen.",
    feature: "Remote interpreting",
    role: "Video remote interpreter",
    replayLine: 3,
  },
  {
    stars: 5,
    quote: "I catch medication names and dosages I would have missed without live captions.",
    feature: "Medical terminology",
    role: "Hospital contract interpreter",
    replayLine: 0,
  },
  {
    stars: 4,
    quote: "Useful support tool during long sessions when speakers switch languages mid-sentence.",
    feature: "Code-switching",
    role: "Multilingual interpreter",
    replayLine: 1,
  },
  {
    stars: 5,
    quote: "Excellent support for remote interpreting—helps me stay oriented without extra tabs.",
    feature: "Workflow support",
    role: "Agency interpreter",
    replayLine: 2,
  },
  {
    stars: 5,
    quote: "Reliable support during fast-paced interpretation sessions across back-to-back calls.",
    feature: "High-volume OPI",
    role: "Language services contractor",
    replayLine: 3,
  },
];
