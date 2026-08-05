/**
 * Creative Studio storyboard model + generation engine.
 *
 * Commercial Brief = source material only.
 * Never copy brief sentences into headlines or narration.
 * Interpret → write a marketing commercial → assemble storyboard.
 */

import { BRAND, TIMING } from "@/lib/brandSystem";
import { getAsset, pickAsset } from "@/lib/assetLibrary";

/** Engine-only beat IDs — never shown as form fields. */
export type SceneRole =
  | "intro"
  | "hook"
  | "problem"
  | "product"
  | "benefits"
  | "outro";

export type AssetType = "workspace" | "stock" | "motion_graphics" | "typography";

export type MotionInstruction = {
  enter: "fade" | "slideUp" | "scale" | "blurIn" | "zoom";
  exit: "fade" | "slideUp" | "scale";
  camera: "hold" | "slowZoom";
  sfx?: string;
};

export type CaptionCue = {
  text: string;
  start: number;
  end: number;
};

export type StoryScene = {
  id: string;
  role: SceneRole;
  label: string;
  start: number;
  end: number;
  duration: number;
  headline: string;
  subhead?: string;
  narration: string;
  voiceover: string;
  captionLine: string;
  captions: CaptionCue[];
  visualDescription: string;
  assetType: AssetType;
  cameraMovement: string;
  transition: string;
  motion: MotionInstruction;
  voiceTiming: string;
  backgroundAssetId: string;
  background: string;
  animation: string;
  textAnimId: string;
  transitionInId: string;
  openerId: string;
  closerId: string;
  overlays: string[];
  shotNotes: string;
  workspacePlacement: "none" | "split" | "full" | "corner";
  brollPlacement: "none" | "under" | "side";
  statCardId?: string;
  iconAnimId?: string;
  statLabel?: string;
};

export type BriefInputKind =
  | "full_script"
  | "bullet_points"
  | "rough_idea"
  | "product_announcement"
  | "feature_notes"
  | "marketing_brief";

export type StoryboardPackage = {
  id: string;
  campaignId: string;
  templateId: string;
  title: string;
  language: string;
  voiceId: string;
  totalDuration: number;
  commercialBrief?: string;
  inputKind?: BriefInputKind;
  marketingScript?: string;
  script: {
    full: string;
    scenes: string[];
  };
  storyboard: StoryScene[];
  shotList: string[];
  cta: {
    primary: string;
    secondary: string;
    url: string;
  };
  translation?: {
    language: string;
    tagline1: string;
    tagline2: string;
  };
  exportHints: {
    width: number;
    height: number;
    fps: number;
    filename: string;
  };
};

export const BRIEF_INPUT_LABELS: Record<BriefInputKind, string> = {
  full_script: "Script source — interpreted into a new commercial",
  bullet_points: "Bullet source — directed commercial",
  rough_idea: "Idea source — commercial written from scratch",
  product_announcement: "Launch source — announcement commercial",
  feature_notes: "Feature source — product-led commercial",
  marketing_brief: "Brief source — directed commercial",
};

export type Campaign = {
  id: string;
  name: string;
  brief: string;
  mood: string;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  framework: "pov_pain" | "us_vs_them" | "shocking_stat" | "product_proof";
  look: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "interpreters_2026",
    name: "Interpreters",
    brief: "Professional interpreters drowning in manual typing — reclaim focus with live AI.",
    mood: "Quiet confidence · peer-to-peer",
  },
  {
    id: "medical_calls",
    name: "Medical calls",
    brief: "High-stakes medical interpretation — accuracy and calm under pressure.",
    mood: "Clinical calm · trust",
  },
  {
    id: "legal_calls",
    name: "Legal calls",
    brief: "Court and counsel calls — precision language without losing presence.",
    mood: "Precision · gravity",
  },
  {
    id: "agencies",
    name: "Agencies",
    brief: "Language agencies scaling quality across 62 languages.",
    mood: "Scale · operations",
  },
];

export const TEMPLATES: Template[] = [
  {
    id: "commercial_30",
    name: "30s Commercial",
    description: "Premium SaaS pacing — cold open, product proof, soft CTA.",
    framework: "pov_pain",
    look: "Loom / Linear energy",
  },
  {
    id: "us_vs_them_30",
    name: "Contrast Cut",
    description: "Chaos vs clarity — side-by-side language, then product settle.",
    framework: "us_vs_them",
    look: "Arc / Notion contrast",
  },
  {
    id: "stat_open_30",
    name: "Stat Open",
    description: "Lead with a hard number, then workspace proof and trial CTA.",
    framework: "shocking_stat",
    look: "Stripe / Vercel open",
  },
  {
    id: "product_proof_30",
    name: "Product Proof",
    description: "Workspace-forward commercial with slow highlight motion.",
    framework: "product_proof",
    look: "Product-led SaaS",
  },
];

const PUBLIC_LABELS: Record<SceneRole, string> = {
  intro: "Brand open",
  hook: "Scene 01",
  problem: "Scene 02",
  product: "Scene 03",
  benefits: "Scene 04",
  outro: "End card",
};

export function publicSceneLabel(role: SceneRole): string {
  return PUBLIC_LABELS[role] ?? "Scene";
}

export function sceneWindows(): { role: SceneRole; start: number; end: number }[] {
  return [
    { role: "intro", start: 0, end: TIMING.introMax },
    { role: "hook", start: TIMING.hook.start, end: TIMING.hook.end },
    { role: "problem", start: TIMING.problem.start, end: TIMING.problem.end },
    { role: "product", start: TIMING.product.start, end: TIMING.product.end },
    { role: "benefits", start: TIMING.benefits.start, end: TIMING.benefits.end },
    { role: "outro", start: TIMING.outro.start, end: TIMING.outro.end },
  ];
}

export function defaultCta() {
  return {
    primary: BRAND.ctaPrimary,
    secondary: BRAND.ctaSecondary,
    url: BRAND.inviteUrl,
  };
}

export function detectBriefKind(text: string): BriefInputKind {
  const t = text.trim();
  if (!t) return "rough_idea";
  const lower = t.toLowerCase();
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^[-*•]\s+|\d+[.)]\s+/.test(l));
  const sentences = t.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 12);
  const wordCount = t.split(/\s+/).filter(Boolean).length;

  if (
    lower.includes("turn this script") ||
    lower.includes("use this script") ||
    lower.startsWith("script:") ||
    (wordCount >= 70 && sentences.length >= 4)
  ) {
    return "full_script";
  }
  if (bulletLines.length >= 3 || (bulletLines.length >= 2 && wordCount < 80)) {
    return "bullet_points";
  }
  if (/\b(launch|introducing|new feature|announcing|just shipped|now live)\b/i.test(t)) {
    return "product_announcement";
  }
  if (
    /\b(feature|translation history|workspace|summary|summaries|glossary)\b/i.test(t) &&
    wordCount < 60
  ) {
    return "feature_notes";
  }
  if (
    /\b(compare|vs\.?|versus|show how|target audience|positioning|cta)\b/i.test(t) &&
    wordCount >= 25
  ) {
    return "marketing_brief";
  }
  return "rough_idea";
}

export function storyboardToPipeline(pack: StoryboardPackage): {
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions: string;
  outroLine1: string;
  outroLine2: string;
} {
  const byRole = (role: SceneRole) => pack.storyboard.find((s) => s.role === role);
  const hook = byRole("hook");
  const problem = byRole("problem");
  const product = byRole("product");
  const benefits = byRole("benefits");
  const outro = byRole("outro");
  const line = (s?: StoryScene) => (s?.narration || s?.voiceover || "").trim();

  return {
    hook: line(hook),
    problem: line(problem),
    solution: line(product),
    result: line(benefits),
    captions: [hook, problem, product, benefits]
      .map((s) => s?.captionLine || s?.headline)
      .filter(Boolean)
      .join(" · "),
    outroLine1: outro?.headline || BRAND.tagline1,
    outroLine2: outro?.subhead || BRAND.tagline2,
  };
}

export function campaignToSeries(campaignId: string): "1" | "2" | "3" | "4" | "10" {
  if (campaignId === "medical_calls") return "1";
  if (campaignId === "legal_calls") return "2";
  if (campaignId === "agencies") return "10";
  return "4";
}

function captionCues(text: string, start: number, end: number): CaptionCue[] {
  const words = text.split(/\s+/).filter(Boolean);
  const dur = Math.max(0.1, end - start);
  return words.map((word, wi) => ({
    text: word,
    start: start + (wi / Math.max(1, words.length)) * dur * 0.85,
    end: start + ((wi + 1) / Math.max(1, words.length)) * dur * 0.85,
  }));
}

function voiceTimingLabel(start: number, end: number): string {
  return `VO ${start.toFixed(1)}s–${end.toFixed(1)}s · ${(end - start).toFixed(1)}s pad`;
}

/** Strip accidental brief leakage from generated lines. */
export function scrubBriefLeakage(text: string, brief: string): string {
  const out = text.trim();
  const b = brief.trim();
  if (!b || !out) return out;
  if (out === b) return "";
  // Drop if generated line is a long contiguous substring of the brief (or vice versa).
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const on = norm(out);
  const bn = norm(b);
  if (on.length >= 24 && (bn.includes(on) || on.includes(bn))) return "";
  return out;
}

function sanitizeSpokenLine(value: string): string {
  const v = value.trim();
  if (!v || /^[.…\s\-–—]+$/.test(v)) return "";
  return v.replace(/\s*[.…]{2,}\s*/g, " ").trim();
}

export function normalizeScene(raw: Partial<StoryScene> & { role: SceneRole }): StoryScene {
  const start = Number(raw.start ?? 0);
  const end = Number(raw.end ?? start + 2);
  const duration = Math.max(0.1, end - start);
  const isBrandCard = raw.role === "intro" || raw.role === "outro";
  const narration = sanitizeSpokenLine(String(raw.narration || raw.voiceover || ""));
  const bg = getAsset(raw.backgroundAssetId || "") || pickAsset("bgLoop", start * 10);
  const text = getAsset(raw.textAnimId || "") || pickAsset("textAnim", start * 3);
  const tr = getAsset(raw.transitionInId || "") || pickAsset("transition", start * 5);
  const requestedType = (raw.assetType || "workspace") as AssetType;
  // Content beats never ship as typography-only slides.
  const assetType: AssetType =
    !isBrandCard && requestedType === "typography" ? "workspace" : requestedType;
  const cameraMovement =
    raw.cameraMovement ||
    (raw.motion?.camera === "slowZoom" ? "Slow push-in" : "Locked hold");
  const captionLine = sanitizeSpokenLine(String(raw.captionLine || narration));
  const overlays: string[] = raw.overlays?.length
    ? raw.overlays
    : [
        text.label,
        ...(raw.statLabel ? [String(raw.statLabel)] : []),
        ...(raw.iconAnimId ? [getAsset(raw.iconAnimId)?.label || "Icon motion"] : []),
      ];

  return {
    id: raw.id || `scene_${raw.role}`,
    role: raw.role,
    label: raw.label || publicSceneLabel(raw.role),
    start,
    end,
    duration,
    headline: String(raw.headline || "InterpreterAI").trim(),
    subhead: raw.subhead ? String(raw.subhead).trim() : undefined,
    narration,
    voiceover: narration,
    captionLine,
    captions: raw.captions?.length ? raw.captions : captionCues(captionLine, start, end),
    visualDescription:
      raw.visualDescription ||
      raw.shotNotes ||
      (isBrandCard
        ? "Branded end card with restrained motion."
        : "Workspace hero with purposeful camera motion."),
    assetType,
    cameraMovement,
    transition: raw.transition || tr.label,
    motion: raw.motion || { enter: "fade", exit: "fade", camera: "hold" },
    voiceTiming: raw.voiceTiming || voiceTimingLabel(start, end),
    backgroundAssetId: raw.backgroundAssetId || bg.id,
    background: raw.background || bg.label,
    animation: raw.animation || text.label,
    textAnimId: raw.textAnimId || text.id,
    transitionInId: raw.transitionInId || tr.id,
    openerId: raw.openerId || pickAsset("sceneOpener", start).id,
    closerId: raw.closerId || pickAsset("sceneCloser", end).id,
    overlays,
    shotNotes: String(raw.shotNotes || raw.visualDescription || "").trim(),
    workspacePlacement: raw.workspacePlacement || (assetType === "workspace" ? "split" : "none"),
    brollPlacement: raw.brollPlacement || (assetType === "stock" ? "under" : "none"),
    statCardId: raw.statCardId,
    iconAnimId: raw.iconAnimId,
    statLabel: raw.statLabel,
  };
}

export function normalizePackage(pack: StoryboardPackage): StoryboardPackage {
  const brief = (pack.commercialBrief || "").trim();
  const storyboard = pack.storyboard.map((s) => {
    const n = normalizeScene(s);
    if (!brief) return n;
    return normalizeScene({
      ...n,
      headline: scrubBriefLeakage(n.headline, brief) || n.headline,
      narration: scrubBriefLeakage(n.narration, brief) || n.narration,
      voiceover: scrubBriefLeakage(n.voiceover, brief) || n.voiceover,
      captionLine: scrubBriefLeakage(n.captionLine, brief) || n.captionLine,
      subhead: n.subhead ? scrubBriefLeakage(n.subhead, brief) || n.subhead : undefined,
    });
  });
  return {
    ...pack,
    commercialBrief: brief || pack.commercialBrief,
    inputKind: pack.inputKind || (brief ? detectBriefKind(brief) : undefined),
    storyboard,
    script: {
      full: storyboard
        .filter((s) => s.role !== "intro" && s.role !== "outro")
        .map((s) => s.narration)
        .filter(Boolean)
        .join(" "),
      scenes: storyboard
        .filter((s) => s.role !== "intro" && s.role !== "outro")
        .map((s) => s.narration),
    },
  };
}

// ── Theme interpretation (source material → creative direction, never echoed) ──

type CreativeTheme =
  | "medical_time"
  | "legal_court"
  | "history_feature"
  | "manual_vs_ai"
  | "agency_scale"
  | "interpreter_focus"
  | "generic_saas";

type SceneDraft = {
  role: Exclude<SceneRole, "intro" | "outro">;
  headline: string;
  subhead?: string;
  narration: string;
  caption: string;
  visualDescription: string;
  assetType: AssetType;
  cameraMovement: string;
  transition: string;
  enter: MotionInstruction["enter"];
  camera: MotionInstruction["camera"];
  workspacePlacement: StoryScene["workspacePlacement"];
  brollPlacement: StoryScene["brollPlacement"];
  statLabel?: string;
};

function interpretTheme(brief: string, campaign: Campaign): CreativeTheme {
  const t = `${brief} ${campaign.id} ${campaign.name}`.toLowerCase();
  if (/\b(translation history|history feature|call history)\b/.test(t)) return "history_feature";
  if (/\b(compare|vs\.?|versus|manual)\b/.test(t)) return "manual_vs_ai";
  if (/\b(medical|hospital|clinic|nurse|doctor|er)\b/.test(t) || campaign.id === "medical_calls") {
    return "medical_time";
  }
  if (/\b(legal|court|counsel|attorney|deposition)\b/.test(t) || campaign.id === "legal_calls") {
    return "legal_court";
  }
  if (/\b(agency|agencies|scale|ops)\b/.test(t) || campaign.id === "agencies") return "agency_scale";
  if (/\b(interpreter|typing|notes|focus)\b/.test(t)) return "interpreter_focus";
  return "generic_saas";
}

/**
 * Creative-director commercial banks.
 * Selected by interpreted theme + template framework — never by pasting the brief.
 */
function writeCommercialScenes(
  theme: CreativeTheme,
  framework: Template["framework"],
): { title: string; marketingScript: string; scenes: SceneDraft[] } {
  /**
   * Continuous SaaS storytelling banks.
   * Rhythm: Hook → Problem → Product Reveal → Product Proof/Benefits.
   * Workspace is the hero. Typography only supports. No empty narration.
   */
  const banks: Record<
    CreativeTheme,
    { title: string; marketingScript: string; scenes: SceneDraft[] }
  > = {
    medical_time: {
      title: "Hours back on every call",
      marketingScript:
        "High-stakes medical calls move without pause. Manual notes steal focus when every turn matters. InterpreterAI opens live — transcription, translation, and summaries in one workspace — so presence stays with the patient. Hours return. Clarity holds.",
      scenes: [
        {
          role: "hook",
          headline: "The call won't wait.",
          narration: "High-stakes medical calls move without pause.",
          caption: "Calls move fast",
          visualDescription: "Workspace hero already live — soft pan across turns. One short headline over UI.",
          assetType: "workspace",
          cameraMovement: "Soft pan across workspace",
          transition: "Crossfade into product stage",
          enter: "fade",
          camera: "hold",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
        {
          role: "problem",
          headline: "Notes steal the room.",
          narration: "Manual notes steal focus when every spoken turn matters.",
          caption: "Focus splits",
          visualDescription: "Dimmed workspace with stock tension underlay — UI still visible, never a black slide.",
          assetType: "stock",
          cameraMovement: "Hold with subtle drift",
          transition: "Opacity bridge",
          enter: "slideUp",
          camera: "hold",
          workspacePlacement: "corner",
          brollPlacement: "under",
        },
        {
          role: "product",
          headline: "Live. Clear. Present.",
          subhead: "InterpreterAI",
          narration:
            "InterpreterAI opens live — transcription, translation, and summaries across sixty-two languages in one workspace.",
          caption: "62 languages live",
          visualDescription: "Product reveal — full workspace punch-in, animated callout on live turns.",
          assetType: "workspace",
          cameraMovement: "Punch-in on live transcript",
          transition: "Scale match reveal",
          enter: "scale",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "62 Languages",
        },
        {
          role: "benefits",
          headline: "Hours back. Clarity in.",
          narration: "Stay with the patient. Let the workspace handle the words. Hours return.",
          caption: "Hours return",
          visualDescription: "Product proof hold — workspace slow zoom with feature callout and soft CTA energy.",
          assetType: "workspace",
          cameraMovement: "Slow proof zoom",
          transition: "Soft dissolve to end card",
          enter: "fade",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "10 Hours Saved",
        },
      ],
    },
    legal_court: {
      title: "Precision without losing presence",
      marketingScript:
        "Proceedings move without pause. Catching every word by hand pulls you out of the room. InterpreterAI keeps the workspace live and exact — so presence stays with the proceeding. Accuracy without the scramble.",
      scenes: [
        {
          role: "hook",
          headline: "The record is moving.",
          narration: "Proceedings move without pause — and the record never waits.",
          caption: "The record moves",
          visualDescription: "Workspace on stage immediately — calm legal UI, soft pan.",
          assetType: "workspace",
          cameraMovement: "Soft pan",
          transition: "Fade into stage",
          enter: "fade",
          camera: "hold",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
        {
          role: "problem",
          headline: "Precision costs presence.",
          narration: "Catching every word by hand pulls you out of the room mid-sentence.",
          caption: "Presence fades",
          visualDescription: "Workspace dimmed + restrained stock tension — still continuous motion.",
          assetType: "stock",
          cameraMovement: "Hold",
          transition: "Soft veil",
          enter: "blurIn",
          camera: "hold",
          workspacePlacement: "corner",
          brollPlacement: "under",
        },
        {
          role: "product",
          headline: "Live. Exact. Calm.",
          subhead: "InterpreterAI",
          narration: "InterpreterAI keeps the workspace live and exact — transcription and translation with a second set of hands.",
          caption: "Live precision",
          visualDescription: "Full workspace reveal with punch-in on speaker turns.",
          assetType: "workspace",
          cameraMovement: "Punch-in",
          transition: "Focus pull",
          enter: "scale",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "Legal Ready",
        },
        {
          role: "benefits",
          headline: "Stay in the proceeding.",
          narration: "Accuracy without the scramble. Presence without the lag.",
          caption: "Stay present",
          visualDescription: "Workspace proof + glass callout into branded outro.",
          assetType: "workspace",
          cameraMovement: "Slow zoom settle",
          transition: "Clean join to end card",
          enter: "fade",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
      ],
    },
    history_feature: {
      title: "Translation History, finally clear",
      marketingScript:
        "After the call, the questions begin. Scattered notes are not a system. Translation History keeps live turns searchable in the workspace — clear when the next question lands. Clarity that lasts.",
      scenes: [
        {
          role: "hook",
          headline: "After the call ends.",
          narration: "After the call ends, the hardest questions begin.",
          caption: "After the call",
          visualDescription: "Workspace hero — history panel hinted with soft pan.",
          assetType: "workspace",
          cameraMovement: "Soft pan to history",
          transition: "Fade in",
          enter: "fade",
          camera: "hold",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
        {
          role: "problem",
          headline: "Memory isn't a system.",
          narration: "Scattered notes and lost threads don't scale across teams.",
          caption: "Notes scatter",
          visualDescription: "Motion graphics over dimmed workspace — fragmented cards, continuous motion.",
          assetType: "motion_graphics",
          cameraMovement: "Hold",
          transition: "Opacity bridge",
          enter: "slideUp",
          camera: "hold",
          workspacePlacement: "corner",
          brollPlacement: "none",
        },
        {
          role: "product",
          headline: "History you can open.",
          subhead: "Translation History",
          narration: "Translation History keeps live turns organized — searchable inside InterpreterAI.",
          caption: "Searchable history",
          visualDescription: "Product reveal — punch-in on history feature in workspace.",
          assetType: "workspace",
          cameraMovement: "Punch-in on history panel",
          transition: "Zoom through soft",
          enter: "zoom",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "Always On",
        },
        {
          role: "benefits",
          headline: "Clarity that lasts.",
          narration: "Pick up where meaning left off — not where the notes ended.",
          caption: "Clarity lasts",
          visualDescription: "Workspace proof hold with feature callout into CTA outro.",
          assetType: "workspace",
          cameraMovement: "Slow proof zoom",
          transition: "Crossfade to end card",
          enter: "fade",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
      ],
    },
    manual_vs_ai: {
      title: "Two ways to work a call",
      marketingScript:
        "Same conversation. Two workflows. Manual notes fray as the pace rises. InterpreterAI keeps the workspace live — clean captions, full presence. Choose the path that keeps you in the room.",
      scenes: [
        {
          role: "hook",
          headline: "Same call. Two paths.",
          narration: "Same conversation — two completely different workflows.",
          caption: "Same call",
          visualDescription: "Workspace on screen — split energy via callout, continuous UI motion.",
          assetType: "workspace",
          cameraMovement: "Soft pan",
          transition: "Fade in",
          enter: "fade",
          camera: "hold",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
        {
          role: "problem",
          headline: "Manual chaos.",
          narration: "One path buries you in notes, lag, and half-heard turns.",
          caption: "Manual chaos",
          visualDescription: "Dimmed workspace + stock tension side — never a text-only card.",
          assetType: "stock",
          cameraMovement: "Hold",
          transition: "Dip soft",
          enter: "slideUp",
          camera: "hold",
          workspacePlacement: "corner",
          brollPlacement: "side",
        },
        {
          role: "product",
          headline: "Live clarity.",
          subhead: "InterpreterAI",
          narration: "The other path keeps InterpreterAI live — clean captions and full presence.",
          caption: "Live clarity",
          visualDescription: "Workspace settle with punch-in — product reveal.",
          assetType: "workspace",
          cameraMovement: "Punch-in",
          transition: "Scene dissolve",
          enter: "scale",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "Live Turns",
        },
        {
          role: "benefits",
          headline: "Choose presence.",
          narration: "Interpreters and agencies choose presence over typing.",
          caption: "Choose presence",
          visualDescription: "Workspace proof + callout into brand outro.",
          assetType: "workspace",
          cameraMovement: "Slow zoom",
          transition: "Clean join",
          enter: "fade",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
      ],
    },
    agency_scale: {
      title: "Quality at agency scale",
      marketingScript:
        "Demand rises and quality still has to hold. More languages mean more chances for meaning to slip. InterpreterAI keeps one calm workspace across sixty-two languages — so consistency scales with volume.",
      scenes: [
        {
          role: "hook",
          headline: "Demand doesn't wait.",
          narration: "Demand rises — and quality still has to hold.",
          caption: "Demand rises",
          visualDescription: "Operations workspace live — soft pan across language activity.",
          assetType: "workspace",
          cameraMovement: "Soft pan",
          transition: "Fade from open",
          enter: "fade",
          camera: "hold",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
        {
          role: "problem",
          headline: "Scale shouldn't dilute.",
          narration: "More languages. More turns. More chances for meaning to slip.",
          caption: "Meaning slips",
          visualDescription: "Motion graphics language chips over live workspace corner.",
          assetType: "motion_graphics",
          cameraMovement: "Hold",
          transition: "Opacity bridge",
          enter: "blurIn",
          camera: "hold",
          workspacePlacement: "corner",
          brollPlacement: "none",
        },
        {
          role: "product",
          headline: "One workspace. 62 languages.",
          subhead: "InterpreterAI",
          narration: "InterpreterAI keeps live interpretation clear across sixty-two languages in one workspace.",
          caption: "62 languages",
          visualDescription: "Full workspace reveal with punch-in and glass stat.",
          assetType: "workspace",
          cameraMovement: "Punch-in",
          transition: "Scale match",
          enter: "scale",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "62 Languages",
        },
        {
          role: "benefits",
          headline: "Quality that scales.",
          narration: "Ship consistency. Keep the human in every call.",
          caption: "Quality scales",
          visualDescription: "Workspace proof zoom into branded CTA outro.",
          assetType: "workspace",
          cameraMovement: "Slow proof zoom",
          transition: "Crossfade to end card",
          enter: "fade",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
      ],
    },
    interpreter_focus: {
      title: "Stay in the conversation",
      marketingScript:
        "Listening and typing were never the same job. When notes win, the conversation loses you. InterpreterAI keeps the workspace live so you stay with the speaker — calm, clear, human.",
      scenes: [
        {
          role: "hook",
          headline: "Still splitting focus?",
          narration: "Listening and typing were never meant to be the same job.",
          caption: "Split focus",
          visualDescription: "Workspace already on screen — peer-to-peer energy, soft pan.",
          assetType: "workspace",
          cameraMovement: "Soft pan",
          transition: "Fade in",
          enter: "fade",
          camera: "hold",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
        {
          role: "problem",
          headline: "Presence fades first.",
          narration: "When notes win, the conversation loses you mid-turn.",
          caption: "Presence fades",
          visualDescription: "Dimmed workspace with soft stock atmosphere — continuous, not a slide.",
          assetType: "stock",
          cameraMovement: "Gentle hold",
          transition: "Opacity bridge",
          enter: "slideUp",
          camera: "hold",
          workspacePlacement: "corner",
          brollPlacement: "under",
        },
        {
          role: "product",
          headline: "We'll handle the words.",
          subhead: "InterpreterAI",
          narration: "InterpreterAI keeps the workspace live — so you stay locked on the speaker.",
          caption: "Live support",
          visualDescription: "Product reveal — workspace punch-in with live callout.",
          assetType: "workspace",
          cameraMovement: "Punch-in",
          transition: "Focus pull",
          enter: "scale",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "100% Focus",
        },
        {
          role: "benefits",
          headline: "Focus returns.",
          narration: "Accuracy without the scramble. Presence without the tradeoff.",
          caption: "Focus returns",
          visualDescription: "Workspace proof into brand tagline outro.",
          assetType: "workspace",
          cameraMovement: "Slow zoom",
          transition: "Clean join",
          enter: "fade",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
      ],
    },
    generic_saas: {
      title: "Clarity, live",
      marketingScript:
        "Meaning moves fast on every call. Lagging notes turn live work into guesswork. InterpreterAI brings transcription and translation into one calm workspace across sixty-two languages — so teams stay with the speaker.",
      scenes: [
        {
          role: "hook",
          headline: "Meaning moves fast.",
          narration: "Meaning moves fast — and you can't rewind a live conversation by hand.",
          caption: "Meaning moves",
          visualDescription: "Workspace hero from frame one — soft pan, premium SaaS light.",
          assetType: "workspace",
          cameraMovement: "Soft pan",
          transition: "Fade in",
          enter: "fade",
          camera: "hold",
          workspacePlacement: "full",
          brollPlacement: "none",
        },
        {
          role: "problem",
          headline: "Catch-up isn't clarity.",
          narration: "Lagging notes turn live work into guesswork.",
          caption: "Lag isn't clarity",
          visualDescription: "Motion pulse over dimmed workspace — continuous engagement.",
          assetType: "motion_graphics",
          cameraMovement: "Hold",
          transition: "Opacity bridge",
          enter: "slideUp",
          camera: "hold",
          workspacePlacement: "corner",
          brollPlacement: "none",
        },
        {
          role: "product",
          headline: "Live across 62 languages.",
          subhead: "InterpreterAI",
          narration: "InterpreterAI brings live transcription and translation into one calm workspace.",
          caption: "62 languages",
          visualDescription: "Workspace-forward product reveal with punch-in.",
          assetType: "workspace",
          cameraMovement: "Punch-in",
          transition: "Scale match",
          enter: "scale",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "62 Languages",
        },
        {
          role: "benefits",
          headline: "Stay with the speaker.",
          narration: "Stay with the speaker. Let the product handle the words.",
          caption: "Stay with them",
          visualDescription: "Workspace proof zoom into trial CTA outro.",
          assetType: "workspace",
          cameraMovement: "Slow proof zoom",
          transition: "Crossfade to end card",
          enter: "fade",
          camera: "slowZoom",
          workspacePlacement: "full",
          brollPlacement: "none",
          statLabel: "7 Days Free",
        },
      ],
    },
  };

  const base = banks[theme];
  if (framework === "shocking_stat" && base.scenes[0]) {
    base.scenes[0] = {
      ...base.scenes[0],
      headline: "62 languages. One workspace.",
      narration: "Sixty-two languages. One workspace built for live clarity.",
      caption: "62 languages",
      assetType: "workspace",
      workspacePlacement: "full",
      statLabel: "62 Languages",
    };
  }
  if (framework === "us_vs_them" && theme !== "manual_vs_ai" && base.scenes[1]) {
    base.scenes[1] = {
      ...base.scenes[1],
      headline: "The old way frays.",
      narration: "Manual workflows fray the moment the pace rises.",
      caption: "The old way",
      assetType: "stock",
      workspacePlacement: "corner",
      brollPlacement: "under",
    };
  }
  // Hard rule: never ship typography-only beats.
  base.scenes = base.scenes.map((s) =>
    s.assetType === ("typography" as AssetType)
      ? { ...s, assetType: "workspace" as AssetType, workspacePlacement: "full" as const }
      : s,
  );
  return base;
}

/** Local storyboard engine — interprets brief, never pastes it. */
export function buildLocalStoryboard(input: {
  campaign: Campaign;
  template: Template;
  commercialBrief?: string;
  language?: string;
  voiceId?: string;
}): StoryboardPackage {
  const { campaign, template } = input;
  const language = input.language || "en";
  const voiceId = input.voiceId || "rachel";
  const brief = (input.commercialBrief || "").trim();
  if (!brief) throw new Error("Commercial Brief is required");

  const inputKind = detectBriefKind(brief);
  const theme = interpretTheme(brief, campaign);
  const creative = writeCommercialScenes(theme, template.framework);

  const content = creative.scenes.map((draft, i) => {
    const win = sceneWindows().find((w) => w.role === draft.role)!;
    const bg = pickAsset("bgLoop", i * 3 + 1);
    const text = pickAsset("textAnim", i + 1);
    const tr = pickAsset("transition", i + 2);
    const icon =
      draft.assetType === "workspace" || draft.role === "benefits"
        ? pickAsset("iconAnim", i + 1)
        : undefined;
    const stat = draft.statLabel ? pickAsset("statCard", i * 2 + 1) : undefined;

    return normalizeScene({
      id: `scene_${draft.role}`,
      role: draft.role,
      start: win.start,
      end: win.end,
      headline: draft.headline,
      subhead: draft.subhead,
      narration: draft.narration,
      voiceover: draft.narration,
      captionLine: draft.caption,
      visualDescription: draft.visualDescription,
      assetType: draft.assetType,
      cameraMovement: draft.cameraMovement,
      transition: draft.transition,
      voiceTiming: voiceTimingLabel(win.start, win.end),
      backgroundAssetId: bg.id,
      textAnimId: text.id,
      transitionInId: tr.id,
      openerId: pickAsset("sceneOpener", i + 1).id,
      closerId: pickAsset("sceneCloser", i + 1).id,
      statCardId: stat?.id,
      iconAnimId: icon?.id,
      motion: {
        enter: draft.enter,
        exit: "fade",
        camera: draft.camera,
        sfx: i === 0 ? "soft_whoosh" : undefined,
      },
      workspacePlacement: draft.workspacePlacement,
      brollPlacement: draft.brollPlacement,
      shotNotes: draft.visualDescription,
      statLabel: draft.statLabel,
      overlays: [
        text.label,
        draft.assetType,
        ...(draft.statLabel ? [draft.statLabel] : []),
      ],
    });
  });

  const intro = normalizeScene({
    id: "scene_intro",
    role: "intro",
    start: 0,
    end: TIMING.introMax,
    headline: BRAND.name,
    subhead: BRAND.tagline1,
    narration: "",
    voiceover: "",
    captionLine: "",
    visualDescription: "Black. Logo. Tiny glow. Tagline. Max 1s.",
    assetType: "typography",
    cameraMovement: "Locked hold",
    transition: "Hard open",
    voiceTiming: "Silent brand open",
    backgroundAssetId: "bg_01",
    textAnimId: "text_01",
    transitionInId: "tr_01",
    openerId: "open_01",
    closerId: "close_01",
    motion: { enter: "fade", exit: "fade", camera: "hold" },
    captions: [],
    workspacePlacement: "none",
    brollPlacement: "none",
    shotNotes: "Black. Logo. Tiny glow. Tagline. Max 1s.",
  });

  const outro = normalizeScene({
    id: "scene_outro",
    role: "outro",
    start: TIMING.outro.start,
    end: TIMING.outro.end,
    headline: BRAND.tagline1,
    subhead: BRAND.tagline2,
    narration: `InterpreterAI. ${BRAND.tagline1} ${BRAND.tagline2} Supports 62 languages. Start your free trial now.`,
    voiceover: `InterpreterAI. ${BRAND.tagline1} ${BRAND.tagline2} Supports 62 languages. Start your free trial now.`,
    captionLine: BRAND.ctaPrimary,
    visualDescription:
      "Locked Universal Brand Outro — 3D master plate, 62 languages, CTA, app.interpreterai.org, QR.",
    assetType: "typography",
    cameraMovement: "Hold settle",
    transition: "Clean join",
    voiceTiming: "Locked 4.0s brand sequence",
    backgroundAssetId: "bg_08",
    textAnimId: "text_20",
    transitionInId: "tr_12",
    openerId: "open_12",
    closerId: "close_20",
    motion: { enter: "fade", exit: "fade", camera: "hold" },
    captions: [],
    workspacePlacement: "none",
    brollPlacement: "none",
    shotNotes:
      "Locked Universal Brand Outro — 3D master plate, 62 languages, CTA, app.interpreterai.org, QR.",
    overlays: ["Logo", "62 languages", "CTA", "app.interpreterai.org", "QR"],
  });

  const storyboard = [intro, ...content, outro];
  const pack = normalizePackage({
    id: `sb_local_${Date.now()}`,
    campaignId: campaign.id,
    templateId: template.id,
    title: creative.title,
    language,
    voiceId,
    totalDuration: 30,
    commercialBrief: brief,
    inputKind,
    marketingScript: creative.marketingScript,
    script: {
      full: creative.marketingScript,
      scenes: content.map((s) => s.narration),
    },
    storyboard,
    shotList: content.map((s) => s.visualDescription),
    cta: defaultCta(),
    translation: {
      language,
      tagline1: BRAND.tagline1,
      tagline2: BRAND.tagline2,
    },
    exportHints: {
      width: 1080,
      height: 1920,
      fps: 30,
      filename: `${campaign.id}_${template.id}_commercial.mp4`,
    },
  });

  return pack;
}
