/**
 * Editable outro layer model — geometry, copy (EN + localized), animation, phrase mapping.
 */

import {
  BRAND_LOCKED,
  UNIVERSAL_OUTRO_EN,
  type UniversalOutroCopy,
} from "@/lib/universalBrandOutro";

export const OUTRO_STAGE_W = 1080;
export const OUTRO_STAGE_H = 1920;

export type OutroLayerId =
  | "brandIcon"
  | "brandWordmark"
  | "line1"
  | "line2"
  | "languagesLine"
  | "ctaHeadline"
  | "ctaSubline"
  | "url"
  | "qr";

export type OutroAnimationPreset = "none" | "fade" | "fadeRise" | "softScale" | "blurClear";

export type OutroLayerAlign = "left" | "center" | "right";

export type OutroLayerKind = "text" | "url" | "qr" | "ctaButton" | "image" | "brandWordmark";

export type OutroLayerDef = {
  id: OutroLayerId;
  kind: OutroLayerKind;
  textEn: string;
  textLocalized?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: OutroLayerAlign;
  visible: boolean;
  animation: OutroAnimationPreset;
  animStartSec: number;
  animDurationSec: number;
  phraseDelaySec: number;
  phraseIndex: number;
  /** CTA pill fill — ctaHeadline only */
  buttonFill?: string;
  uppercase?: boolean;
};

export type OutroLayerDocument = {
  layers: Record<OutroLayerId, OutroLayerDef>;
  /** BCP-47-ish language code for textLocalized fields */
  localizedLang?: string;
};

export type OutroLocalizedBundle = {
  lang: string;
  copy: UniversalOutroCopy;
};

/** @deprecated No longer used — plate artwork is shown as-is; no opaque masking. */
export const BAKED_COPY_MASKS: { x: number; y: number; w: number; h: number }[] = [];

export const OUTRO_SAFE = {
  padX: 24,
  padY: 24,
  minW: 32,
  minH: 16,
};

export const OUTRO_STAGE_CENTER = {
  x: OUTRO_STAGE_W / 2,
  y: OUTRO_STAGE_H / 2,
};

export const OUTRO_SNAP_THRESHOLD = 14;

/** Layers exposed in the outro editor (geometry + copy). */
export const OUTRO_EDITABLE_LAYER_IDS: OutroLayerId[] = [
  "brandIcon",
  "brandWordmark",
  "line1",
  "line2",
  "languagesLine",
  "ctaHeadline",
  "ctaSubline",
  "url",
  "qr",
];

export const OUTRO_LAYER_LABELS: Record<OutroLayerId, string> = {
  brandIcon: "Logo icon",
  brandWordmark: "InterpreterAI",
  line1: "Headline",
  line2: "Subhead",
  languagesLine: "Languages",
  ctaHeadline: "CTA",
  ctaSubline: "Subline",
  url: "URL",
  qr: "QR code",
};

const CYAN = "#20D4F0";
const INK = "#FFFFFF";
const MUTED = "rgba(255, 255, 255, 0.72)";

export const OUTRO_ICON_BOX = { x: 430, y: 300, w: 220, h: 220 } as const;
export const OUTRO_WORDMARK_BOX = { x: 90, y: 540, w: 900, h: 96 } as const;

/** @deprecated Use OUTRO_ICON_BOX + OUTRO_WORDMARK_BOX */
export const OUTRO_LOCKUP_BOX = { x: 140, y: 340, w: 800, h: 400 } as const;

/** Text layers with editable fontSize (px on 1080×1920 stage). */
export const OUTRO_TEXT_LAYER_IDS: OutroLayerId[] = [
  "brandWordmark",
  "line1",
  "line2",
  "languagesLine",
  "ctaHeadline",
  "ctaSubline",
  "url",
];

export function layerSupportsFontSize(layer: OutroLayerDef): boolean {
  return (
    layer.kind === "text" ||
    layer.kind === "url" ||
    layer.kind === "ctaButton" ||
    layer.kind === "brandWordmark"
  );
}

export const OUTRO_MAX_FONT_SIZE = 320;

export function defaultOutroLayerDocument(copy?: Partial<UniversalOutroCopy>): OutroLayerDocument {
  const line1 = (copy?.line1 ?? UNIVERSAL_OUTRO_EN.line1).trim();
  const line2 = (copy?.line2 ?? UNIVERSAL_OUTRO_EN.line2).trim();
  const languagesLine = (copy?.languagesLine ?? UNIVERSAL_OUTRO_EN.languagesLine).trim();
  const ctaHeadline = (copy?.ctaHeadline ?? UNIVERSAL_OUTRO_EN.ctaHeadline).trim();
  const ctaSubline = (copy?.ctaSubline ?? UNIVERSAL_OUTRO_EN.ctaSubline).trim();
  const url = BRAND_LOCKED.displayUrl;

  const layers: Record<OutroLayerId, OutroLayerDef> = {
    brandIcon: {
      id: "brandIcon",
      kind: "image",
      textEn: BRAND_LOCKED.name,
      x: OUTRO_ICON_BOX.x,
      y: OUTRO_ICON_BOX.y,
      width: OUTRO_ICON_BOX.w,
      height: OUTRO_ICON_BOX.h,
      fontSize: 0,
      fontWeight: 0,
      color: INK,
      align: "center",
      visible: true,
      animation: "softScale",
      animStartSec: 0,
      animDurationSec: 0.6,
      phraseDelaySec: 0,
      phraseIndex: -1,
    },
    brandWordmark: {
      id: "brandWordmark",
      kind: "brandWordmark",
      textEn: BRAND_LOCKED.name,
      x: OUTRO_WORDMARK_BOX.x,
      y: OUTRO_WORDMARK_BOX.y,
      width: OUTRO_WORDMARK_BOX.w,
      height: OUTRO_WORDMARK_BOX.h,
      fontSize: 74,
      fontWeight: 600,
      color: INK,
      align: "center",
      visible: true,
      animation: "softScale",
      animStartSec: 0,
      animDurationSec: 0.6,
      phraseDelaySec: 0,
      phraseIndex: -1,
    },
    line1: {
      id: "line1",
      kind: "text",
      textEn: line1,
      x: 90,
      y: 780,
      width: 900,
      height: 80,
      fontSize: 44,
      fontWeight: 700,
      color: INK,
      align: "center",
      visible: true,
      animation: "fadeRise",
      animStartSec: 0.75,
      animDurationSec: 0.45,
      phraseDelaySec: 0,
      phraseIndex: 0,
    },
    line2: {
      id: "line2",
      kind: "text",
      textEn: line2,
      x: 90,
      y: 875,
      width: 900,
      height: 70,
      fontSize: 34,
      fontWeight: 600,
      color: MUTED,
      align: "center",
      visible: true,
      animation: "fadeRise",
      animStartSec: 2.15,
      animDurationSec: 0.4,
      phraseDelaySec: 0,
      phraseIndex: 1,
    },
    languagesLine: {
      id: "languagesLine",
      kind: "text",
      textEn: languagesLine,
      x: 48,
      y: 1040,
      width: 984,
      height: 56,
      fontSize: 26,
      fontWeight: 700,
      color: "rgba(255, 255, 255, 0.88)",
      align: "center",
      visible: true,
      animation: "fade",
      animStartSec: 3.45,
      animDurationSec: 0.35,
      phraseDelaySec: 0,
      phraseIndex: 2,
      uppercase: true,
    },
    ctaHeadline: {
      id: "ctaHeadline",
      kind: "ctaButton",
      textEn: ctaHeadline,
      x: 315,
      y: 1185,
      width: 450,
      height: 68,
      fontSize: 28,
      fontWeight: 700,
      color: INK,
      align: "center",
      visible: true,
      animation: "softScale",
      animStartSec: 4.25,
      animDurationSec: 0.45,
      phraseDelaySec: 0,
      phraseIndex: 3,
      buttonFill: CYAN,
    },
    ctaSubline: {
      id: "ctaSubline",
      kind: "text",
      textEn: ctaSubline,
      x: 180,
      y: 1270,
      width: 720,
      height: 40,
      fontSize: 21,
      fontWeight: 500,
      color: MUTED,
      align: "center",
      visible: true,
      animation: "fade",
      animStartSec: 4.5,
      animDurationSec: 0.35,
      phraseDelaySec: 0,
      phraseIndex: -1,
    },
    url: {
      id: "url",
      kind: "url",
      textEn: url,
      x: 200,
      y: 1325,
      width: 680,
      height: 36,
      fontSize: 23,
      fontWeight: 600,
      color: CYAN,
      align: "center",
      visible: true,
      animation: "fade",
      animStartSec: 5.2,
      animDurationSec: 0.35,
      phraseDelaySec: 0,
      phraseIndex: 4,
    },
    qr: {
      id: "qr",
      kind: "qr",
      textEn: "",
      x: 480,
      y: 1385,
      width: 130,
      height: 130,
      fontSize: 0,
      fontWeight: 0,
      color: INK,
      align: "center",
      visible: true,
      animation: "fade",
      animStartSec: 5.35,
      animDurationSec: 0.35,
      phraseDelaySec: 0,
      phraseIndex: -1,
    },
  };

  return { layers };
}

export function migrateOutroLayerDocument(raw: unknown): OutroLayerDocument {
  const base = defaultOutroLayerDocument();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<OutroLayerDocument>;
  const out: OutroLayerDocument = {
    layers: { ...base.layers },
    localizedLang: typeof r.localizedLang === "string" ? r.localizedLang : undefined,
  };
  if (r.layers && typeof r.layers === "object") {
    const rawLayers = r.layers as Record<string, unknown>;
    migrateLegacyBrandLockup(out, rawLayers);
    for (const id of Object.keys(base.layers) as OutroLayerId[]) {
      const src = rawLayers[id];
      if (!src || typeof src !== "object") continue;
      const s = src as Partial<OutroLayerDef>;
      out.layers[id] = {
        ...base.layers[id],
        ...s,
        id,
        kind: base.layers[id].kind,
        textEn: typeof s.textEn === "string" ? s.textEn : base.layers[id].textEn,
        textLocalized: typeof s.textLocalized === "string" ? s.textLocalized : s.textLocalized,
      };
    }
  }
  if (iconNeedsUpgrade(out.layers.brandIcon)) {
    out.layers.brandIcon = {
      ...out.layers.brandIcon,
      x: OUTRO_ICON_BOX.x,
      y: OUTRO_ICON_BOX.y,
      width: OUTRO_ICON_BOX.w,
      height: OUTRO_ICON_BOX.h,
    };
  }
  if (stackedBrandNeedsUpgrade(out)) {
    const fresh = defaultOutroLayerDocument(englishCopyFromLayers(out, ""));
    out.layers.brandIcon = {
      ...fresh.layers.brandIcon,
      visible: out.layers.brandIcon.visible,
    };
    out.layers.brandWordmark = {
      ...fresh.layers.brandWordmark,
      visible: out.layers.brandWordmark.visible,
      fontSize:
        out.layers.brandWordmark.fontSize > 0
          ? out.layers.brandWordmark.fontSize
          : fresh.layers.brandWordmark.fontSize,
    };
  }
  if (canonicalLayoutNeedsUpgrade(out)) {
    const fresh = defaultOutroLayerDocument(englishCopyFromLayers(out, ""));
    for (const id of Object.keys(fresh.layers) as OutroLayerId[]) {
      const cur = out.layers[id];
      const def = fresh.layers[id];
      out.layers[id] = {
        ...def,
        textEn: cur.textEn,
        textLocalized: cur.textLocalized,
        visible: cur.visible,
        fontSize: cur.fontSize !== def.fontSize && cur.fontSize > 0 ? cur.fontSize : def.fontSize,
      };
    }
  }
  return out;
}

/** Saved layouts from the old combined lockup → stacked icon + wordmark. */
function stackedBrandNeedsUpgrade(doc: OutroLayerDocument): boolean {
  const icon = doc.layers.brandIcon;
  const word = doc.layers.brandWordmark;
  if (icon.width >= 600 || word.y < icon.y + icon.height - 20) return true;
  return icon.x < 200 && icon.width > 400;
}

function migrateLegacyBrandLockup(
  out: OutroLayerDocument,
  rawLayers: Record<string, unknown>,
): void {
  const legacy = rawLayers.brandLockup;
  if (!legacy || typeof legacy !== "object") return;
  if (rawLayers.brandIcon || rawLayers.brandWordmark) return;
  const s = legacy as Partial<OutroLayerDef>;
  const lx = typeof s.x === "number" ? s.x : OUTRO_LOCKUP_BOX.x;
  const ly = typeof s.y === "number" ? s.y : OUTRO_LOCKUP_BOX.y;
  const lw = typeof s.width === "number" ? s.width : OUTRO_LOCKUP_BOX.w;
  const lh = typeof s.height === "number" ? s.height : OUTRO_LOCKUP_BOX.h;
  const iconSize = Math.round(Math.min(lw * 0.28, 240));
  const iconX = Math.round(lx + (lw - iconSize) / 2);
  const iconY = Math.round(ly + lh * 0.04);
  out.layers.brandIcon = {
    ...out.layers.brandIcon,
    x: iconX,
    y: iconY,
    width: iconSize,
    height: iconSize,
    visible: s.visible ?? true,
  };
  out.layers.brandWordmark = {
    ...out.layers.brandWordmark,
    x: lx,
    y: iconY + iconSize + Math.round(16 * (lh / OUTRO_LOCKUP_BOX.h)),
    width: lw,
    height: Math.max(72, Math.round(lh * 0.22)),
    visible: s.visible ?? true,
  };
}

/** Saved layouts from the old 10s plate (headline y≈1110) → canonical 7s positions. */
function canonicalLayoutNeedsUpgrade(doc: OutroLayerDocument): boolean {
  return doc.layers.line1.y >= 1000 || doc.layers.brandIcon.y >= 500;
}

/** Legacy icon crops that clipped the bolt — auto-upgrade on load. */
const LEGACY_ICON_GEOMETRY: Pick<OutroLayerDef, "x" | "y" | "width" | "height">[] = [
  { x: 180, y: 630, width: 720, height: 460 },
  { x: 180, y: 630, width: 720, height: 480 },
  { x: OUTRO_LOCKUP_BOX.x, y: OUTRO_LOCKUP_BOX.y, width: OUTRO_LOCKUP_BOX.w, height: OUTRO_LOCKUP_BOX.h },
];

function iconNeedsUpgrade(layer: OutroLayerDef): boolean {
  if (
    LEGACY_ICON_GEOMETRY.some(
      (g) =>
        layer.x === g.x &&
        layer.y === g.y &&
        layer.width === g.width &&
        layer.height === g.height,
    )
  ) {
    return true;
  }
  return layer.y === 630 && layer.height <= 500;
}

export function updateLayerFontSize(
  doc: OutroLayerDocument,
  id: OutroLayerId,
  fontSize: number,
): OutroLayerDocument {
  const next = migrateOutroLayerDocument(doc);
  const layer = next.layers[id];
  if (!layerSupportsFontSize(layer)) return next;
  next.layers[id] = { ...layer, fontSize: Math.max(10, Math.min(OUTRO_MAX_FONT_SIZE, Math.round(fontSize))) };
  return next;
}

export function syncLayerTextFromCopy(
  doc: OutroLayerDocument,
  copy: UniversalOutroCopy,
  opts?: { localized?: boolean; lang?: string },
): OutroLayerDocument {
  const next = migrateOutroLayerDocument(doc);
  next.layers.line1.textEn = copy.line1;
  next.layers.line2.textEn = copy.line2;
  next.layers.languagesLine.textEn = copy.languagesLine ?? UNIVERSAL_OUTRO_EN.languagesLine;
  next.layers.ctaHeadline.textEn = copy.ctaHeadline;
  next.layers.ctaSubline.textEn = copy.ctaSubline ?? UNIVERSAL_OUTRO_EN.ctaSubline;
  next.layers.url.textEn = BRAND_LOCKED.displayUrl;
  if (opts?.localized && opts.lang) {
    next.localizedLang = opts.lang;
    next.layers.line1.textLocalized = copy.line1;
    next.layers.line2.textLocalized = copy.line2;
    next.layers.languagesLine.textLocalized = copy.languagesLine ?? UNIVERSAL_OUTRO_EN.languagesLine;
    next.layers.ctaHeadline.textLocalized = copy.ctaHeadline;
    next.layers.ctaSubline.textLocalized = copy.ctaSubline ?? UNIVERSAL_OUTRO_EN.ctaSubline;
  }
  return next;
}

export function applyLocalizedCopyToLayers(
  doc: OutroLayerDocument,
  copy: UniversalOutroCopy,
  lang: string,
): OutroLayerDocument {
  const next = migrateOutroLayerDocument(doc);
  next.localizedLang = lang;
  next.layers.line1.textLocalized = copy.line1;
  next.layers.line2.textLocalized = copy.line2;
  next.layers.languagesLine.textLocalized = copy.languagesLine ?? UNIVERSAL_OUTRO_EN.languagesLine;
  next.layers.ctaHeadline.textLocalized = copy.ctaHeadline;
  next.layers.ctaSubline.textLocalized = copy.ctaSubline ?? UNIVERSAL_OUTRO_EN.ctaSubline;
  return next;
}

export function clearLocalizedLayers(doc: OutroLayerDocument): OutroLayerDocument {
  const next = migrateOutroLayerDocument(doc);
  next.localizedLang = undefined;
  for (const id of Object.keys(next.layers) as OutroLayerId[]) {
    delete next.layers[id].textLocalized;
  }
  return next;
}

export function layerDisplayText(layer: OutroLayerDef, displayLang: string): string {
  if (displayLang !== "en" && layer.textLocalized?.trim()) {
    return layer.textLocalized.trim();
  }
  if (layer.kind === "url") {
    return layer.textEn.trim() || BRAND_LOCKED.displayUrl;
  }
  return layer.textEn.trim();
}

/** @deprecated All layers render dynamically on the clean plate. */
export function shouldDrawDynamicLayer(_layer: OutroLayerDef, _displayLang: string): boolean {
  return true;
}

function defaultLayerGeometry(
  id: OutroLayerId,
  doc: OutroLayerDocument,
): Pick<OutroLayerDef, "x" | "y" | "width" | "height"> {
  const defaults = defaultOutroLayerDocument(englishCopyFromLayers(doc, ""));
  return defaults.layers[id];
}

/** True when the user moved or resized a layer away from its default box. */
export function layerGeometryIsCustom(
  layer: OutroLayerDef,
  id: OutroLayerId,
  doc: OutroLayerDocument,
): boolean {
  const def = defaultLayerGeometry(id, doc);
  return (
    layer.x !== def.x ||
    layer.y !== def.y ||
    layer.width !== def.width ||
    layer.height !== def.height
  );
}

/** Whether the shared renderer should paint this layer. */
export function shouldPaintLayer(layer: OutroLayerDef): boolean {
  return layer.visible;
}

export function copyFromLayerDocument(
  doc: OutroLayerDocument,
  voiceover: string,
  displayLang: string,
): UniversalOutroCopy {
  const L = doc.layers;
  const pick = (layer: OutroLayerDef) => layerDisplayText(layer, displayLang);
  return {
    line1: pick(L.line1),
    line2: pick(L.line2),
    ctaHeadline: pick(L.ctaHeadline),
    languagesLine: pick(L.languagesLine),
    ctaSubline: pick(L.ctaSubline),
    voiceover,
  };
}

export function englishCopyFromLayers(doc: OutroLayerDocument, voiceoverEn: string): UniversalOutroCopy {
  return copyFromLayerDocument(doc, voiceoverEn, "en");
}

export function clampLayerToSafeArea(layer: OutroLayerDef): OutroLayerDef {
  const padX = OUTRO_SAFE.padX;
  const padY = OUTRO_SAFE.padY;
  const maxW = OUTRO_STAGE_W - padX * 2;
  const maxH = OUTRO_STAGE_H - padY * 2;
  let { x, y, width, height } = layer;
  width = Math.max(OUTRO_SAFE.minW, Math.min(width, maxW));
  height = Math.max(OUTRO_SAFE.minH, Math.min(height, maxH));
  x = Math.max(padX, Math.min(x, OUTRO_STAGE_W - padX - width));
  y = Math.max(padY, Math.min(y, OUTRO_STAGE_H - padY - height));
  return { ...layer, x, y, width, height };
}

export function resetLayerToDefault(id: OutroLayerId, doc: OutroLayerDocument): OutroLayerDocument {
  const defaults = defaultOutroLayerDocument(englishCopyFromLayers(doc, ""));
  const next = migrateOutroLayerDocument(doc);
  const current = next.layers[id];
  const def = defaults.layers[id];
  next.layers[id] = {
    ...def,
    textEn: current.textEn,
    textLocalized: current.textLocalized,
  };
  return next;
}

export function resetAllLayersToDefault(doc: OutroLayerDocument): OutroLayerDocument {
  const enCopy = englishCopyFromLayers(doc, "");
  const defaults = defaultOutroLayerDocument(enCopy);
  const next = migrateOutroLayerDocument(doc);
  for (const id of Object.keys(defaults.layers) as OutroLayerId[]) {
    next.layers[id] = {
      ...defaults.layers[id],
      textEn: next.layers[id].textEn,
      textLocalized: next.layers[id].textLocalized,
    };
  }
  return next;
}

export function snapLayerPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; snapX: boolean; snapY: boolean } {
  const cx = x + width / 2;
  const cy = y + height / 2;
  let snapX = false;
  let snapY = false;
  let nx = x;
  let ny = y;
  if (Math.abs(cx - OUTRO_STAGE_CENTER.x) < OUTRO_SNAP_THRESHOLD) {
    nx = OUTRO_STAGE_CENTER.x - width / 2;
    snapX = true;
  }
  if (Math.abs(cy - OUTRO_STAGE_CENTER.y) < OUTRO_SNAP_THRESHOLD) {
    ny = OUTRO_STAGE_CENTER.y - height / 2;
    snapY = true;
  }
  return { x: nx, y: ny, snapX, snapY };
}

export function updateLayerGeometry(
  doc: OutroLayerDocument,
  id: OutroLayerId,
  patch: Partial<Pick<OutroLayerDef, "x" | "y" | "width" | "height" | "fontSize">>,
  opts?: { fromResize?: boolean; origWidth?: number; origHeight?: number; origFontSize?: number },
): OutroLayerDocument {
  const next = migrateOutroLayerDocument(doc);
  let updated = { ...next.layers[id], ...patch };
  if (
    opts?.fromResize &&
    opts.origWidth &&
    opts.origHeight &&
    (patch.width != null || patch.height != null)
  ) {
    const newW = patch.width ?? opts.origWidth;
    const newH = patch.height ?? opts.origHeight;
    const ratio = Math.min(newW / opts.origWidth, newH / opts.origHeight);
    if (updated.kind === "text" || updated.kind === "url" || updated.kind === "ctaButton") {
      const baseSize = opts.origFontSize ?? updated.fontSize;
      updated.fontSize = Math.max(10, Math.round(baseSize * ratio));
    }
  }
  next.layers[id] = clampLayerToSafeArea(updated);
  return next;
}

export function updateLayerTextEn(
  doc: OutroLayerDocument,
  id: OutroLayerId,
  text: string,
): OutroLayerDocument {
  const next = migrateOutroLayerDocument(doc);
  if (id === "url" || id === "brandIcon" || id === "brandWordmark") return next;
  next.layers[id].textEn = text;
  return next;
}

export function updateLayerTextLocalized(
  doc: OutroLayerDocument,
  id: OutroLayerId,
  text: string,
  lang: string,
): OutroLayerDocument {
  const next = migrateOutroLayerDocument(doc);
  if (id === "url" || id === "qr" || id === "brandIcon" || id === "brandWordmark") return next;
  next.localizedLang = lang;
  next.layers[id].textLocalized = text;
  return next;
}
