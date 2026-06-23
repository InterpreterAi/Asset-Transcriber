/**
 * Preserved marketing copy — mapped in docs/cinematic-website-v2/SPEC.md
 * Do not paraphrase for cinematic v2 home.
 */

import { WORKSPACE_LANGUAGE_COUNT } from "@/lib/workspace-languages";

const LANG_COUNT = WORKSPACE_LANGUAGE_COUNT;

export const CINEMATIC_CONTENT = {
  eyebrow: {
    infrastructure: "Professional interpreter infrastructure",
    product: "Product",
    coverage: "Coverage",
    solutions: "Solutions",
    trustCenter: "Trust center",
    productDev: "Product development",
    pricing: "Pricing",
  },
  chapterFrames: {
    ch1: "Communication should never be the barrier.",
    ch3: "Every conversation passes through understanding.",
    ch4: `${LANG_COUNT}+ languages. One conversation.`,
    ch4Sub:
      "Connect people across borders without interrupting the flow of communication.",
    ch7: "Built for every stage of growth.",
    ch7Sub: "From independent professionals to enterprise deployments.",
    ch9: "Every Conversation.\nAny Language.",
  },
  testimonials: {
    eyebrow: "Social proof",
    title: "Trusted by professional interpreters",
    subtitle: "Workflow feedback from OPI, VRI, and multilingual sessions—emerging from the same live conversation you just watched.",
  },
  hero: {
    h1: "Real-Time Support for Professional Interpreters",
    h1Lead: "Real-Time Support for",
    h1Accent: "Professional Interpreters",
    subhead:
      `Real-time captions and multilingual language assistance designed for professional OPI and VRI interpretation workflows across ${LANG_COUNT} supported languages.`,
    noCard: "No credit card required to start.",
    pills: ["Hear & capture", "Live captions", "Translation assist"] as const,
  },
  /** Conversion pillars — original site positioning, preserved verbatim. */
  positioningPillars: [
    { title: "Real-Time AI Captioning", short: "Live captions" },
    { title: "Translation Assistance", short: "Translation assist" },
    { title: "Professional Interpreters", short: "Interpreter-first" },
    { title: "OPI", short: "Over-the-phone" },
    { title: "VRI", short: "Video remote" },
    { title: "Speaker Identification", short: "Speaker ID" },
    { title: "Privacy-First Workflows", short: "Privacy-first" },
    { title: `${LANG_COUNT}+ Languages`, short: `${LANG_COUNT}+ languages` },
  ] as const,
  product: {
    title: "Your live session workspace",
    subtitle:
      "One focused surface for real-time captions, translation assistance, and interpreter workflow support—so you stay oriented during OPI and VRI sessions without unnecessary clutter.",
    liveDemoTitle: "See captions and translation build live",
    liveDemoSub:
      "Original speech and assist text appear in real time—the same side-by-side layout interpreters use in session.",
  },
  capabilities: {
    sectionTitle: "Platform capabilities",
    sectionSub:
      "Clear, workflow-centered support for live interpretation—real-time captions, multilingual assistance, and tools aligned with how professional interpreters work.",
    cards: [
      { title: "Real-Time Captions", body: "Follow conversations live during fast-paced multilingual sessions." },
      { title: "Translation Assistance", body: "Live language support designed for interpretation workflows." },
      { title: "OPI & VRI Ready", body: "Designed specifically for remote interpretation sessions." },
      { title: "Interpreter Workflow Support", body: "Helps reduce fatigue during long bilingual conversations." },
      { title: "Privacy-Focused Infrastructure", body: "Built with secure real-time processing practices." },
    ] as const,
  },
  howItWorks: {
    title: "How InterpreterAI Supports Live Sessions",
    sub: "The platform provides real-time captions, translation assistance, and multilingual workflow support designed for professional interpretation environments.",
    steps: [
      {
        title: "Live captions appear",
        body: "Readable text updates as dialogue progresses—supporting clarity during rapid exchanges.",
      },
      {
        title: "Translation assistance updates in real time",
        body: "Assistance columns stay aligned with the session so you can focus on interpretation—not manual note-taking.",
      },
      {
        title: "Interpreters remain fully in control",
        body: "The workspace supports your workflow; session use follows your professional judgment and policies.",
      },
      {
        title: "Multilingual coverage",
        body: `The platform supports ${LANG_COUNT} languages for varied OPI, VRI, and remote communication contexts.`,
      },
    ] as const,
  },
  languages: {
    title: `${LANG_COUNT}+ Supported Languages`,
    body: "Built for multilingual interpretation workflows across medical, customer support, and remote communication environments.",
    streamCodes: ["EN", "ES", "AR", "FR", "ZH", "DE", "PT", "IT", "JA", "KO"] as const,
  },
  solutions: {
    title: "OPI & VRI workflows",
    subtitle:
      "Over-the-phone (OPI) and video remote (VRI) sessions need legible real-time captions and calm translation assistance. InterpreterAI is structured as professional workflow infrastructure—built for interpreters, not generic meeting tooling.",
    opi: {
      title: "OPI",
      body: "Phone-based interpretation support when callers rotate quickly—paired with captions and assistance columns that keep dialogue legible while you interpret.",
    },
    vri: {
      title: "VRI",
      body: "Remote video sessions where screen space is limited—your workspace stays minimal while real-time captions and assistance support bilingual workflows.",
    },
  },
  trust: {
    landingTitle: "Trusted operations",
    landingIntro: "A calm foundation for teams that cannot afford ambiguity about security or privacy posture.",
    privacyHeadline: "Privacy-first by design",
    privacyBody:
      "Session-oriented processing, minimized retention patterns, and interpreter-controlled workflows—your encounter data stays in your professional context.",
    securityHero:
      "InterpreterAI is designed with HIPAA-focused thinking and privacy-conscious architecture. We describe our practices carefully—without claiming certifications we have not earned.",
    bullets: [
      { title: "HIPAA-focused architecture", body: "Designed with regulated healthcare workflows in mind." },
      { title: "Secure real-time processing", body: "Session-oriented streaming with modern transport security." },
      { title: "Interpreter-controlled sessions", body: "You decide how and when the workspace is used." },
      { title: "Privacy-first workflows", body: "Minimized retention patterns aligned with product design." },
      { title: "Enterprise-grade infrastructure", body: "Reliable hosting and operational discipline." },
      { title: "OPI & VRI ready", body: "Structured for phone-based and remote video sessions." },
    ] as const,
  },
  scale: {
    feedbackTitle: "Built With Interpreter Feedback",
    feedbackBody:
      "We continuously improve the platform using real interpreter workflow feedback to enhance speed, clarity, and reliability.",
    timeline: [
      { label: "Workflow research", detail: "Interpreter sessions and feedback inform what we build next." },
      { label: "Platform iteration", detail: "Speed, clarity, and reliability improvements ship continuously." },
      { label: "Operational discipline", detail: "Reliability and security practices evolve with the product." },
    ] as const,
    enterprise: {
      title: "Enterprise-friendly posture",
      body: "InterpreterAI is built for organizations that review vendor practices before rollout. Explore our trust center for security framing, and our privacy page for data-handling expectations.",
      bullets: ["HIPAA-focused architecture", "Session-oriented design", "Continuous platform improvements"] as const,
    },
    marqueeLabel: "Interpreters at leading language service organizations",
    footerTagline: "Professional infrastructure for real-time interpreter support across OPI and VRI workflows.",
  },
  pricing: {
    landingTitle: "Transparent pricing",
    landingSub:
      "Compare plans with a clear feature matrix—built for interpreters who need predictable, professional software.",
    pageTitle: "Calm, transparent plans",
    pageIntro:
      "Built for professional interpreters across OPI and VRI-style workflows. All plans include core session tooling with enterprise-minded security practices.",
    footnote:
      "OPI and VRI workflows are supported at the workspace level; compliance is always shared between your organization and your platform configuration. See Security for our trust posture.",
  },
  legal: {
    notice:
      "InterpreterAI is a professional support tool. You remain responsible for compliance with employer policies, contractual duties, and applicable law when using any assistive software during interpreted encounters.",
  },
  ctas: {
    startTrial: "Start Free Trial",
    viewSecurity: "View Security & Privacy",
    viewPricing: "View pricing",
    securityCenter: "Security center",
    privacyPolicy: "Privacy policy",
    startFreeTrial: "Start free trial",
  },
  workspace: {
    disclaimer: "Illustrative interface — not a live session.",
    langPair: "English ↔ Spanish",
  },
} as const;
