/** Scroll-driven workspace position — smooth lerp between chapter anchors (never unmounts). */
export type WorkspaceMotion = {
  x: number;
  y: number;
  w: number;
  scale: number;
  opacity: number;
};

type Anchor = { p: number; x: number; y: number; w: number; scale: number };

const ANCHORS: readonly Anchor[] = [
  { p: 0, x: 50, y: 66, w: 92, scale: 0.92 },
  { p: 0.145, x: 50, y: 34, w: 92, scale: 0.9 },
  { p: 0.25, x: 73, y: 50, w: 46, scale: 0.95 },
  { p: 0.35, x: 27, y: 50, w: 46, scale: 0.95 },
  { p: 0.45, x: 73, y: 50, w: 46, scale: 0.95 },
  { p: 0.55, x: 73, y: 50, w: 46, scale: 0.93 },
  { p: 0.65, x: 27, y: 50, w: 46, scale: 0.93 },
  { p: 0.78, x: 50, y: 36, w: 90, scale: 0.88 },
  { p: 0.86, x: 50, y: 50, w: 70, scale: 0.75 },
];

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateWorkspaceMotion(p: number): WorkspaceMotion {
  const clamped = Math.min(1, Math.max(0, p));

  if (clamped >= 0.86) {
    const t = smoothstep((clamped - 0.86) / 0.14);
    const last = ANCHORS[ANCHORS.length - 1]!;
    return {
      x: last.x,
      y: last.y,
      w: lerp(last.w, 40, t),
      scale: lerp(last.scale, 0.2, t),
      opacity: 1 - t,
    };
  }

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i]!;
    const b = ANCHORS[i + 1]!;
    if (clamped >= a.p && clamped <= b.p) {
      const span = b.p - a.p || 1;
      const t = smoothstep((clamped - a.p) / span);
      return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        w: lerp(a.w, b.w, t),
        scale: lerp(a.scale, b.scale, t),
        opacity: 1,
      };
    }
  }

  const first = ANCHORS[0]!;
  return { x: first.x, y: first.y, w: first.w, scale: first.scale, opacity: 1 };
}
