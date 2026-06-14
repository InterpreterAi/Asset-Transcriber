/** Horizontal half-pane only — workspace stays in one 50% column, never over copy. */
export type WorkspaceMotion = {
  /** 0 = left half, 50 = right half (interpolated smoothly) */
  left: number;
  opacity: number;
};

type Anchor = { p: number; left: number };

/** left: 50 → workspace on RIGHT (copy on left). left: 0 → workspace on LEFT (copy on right). */
const ANCHORS: readonly Anchor[] = [
  { p: 0, left: 50 },
  { p: 0.145, left: 0 },
  { p: 0.25, left: 50 },
  { p: 0.35, left: 0 },
  { p: 0.45, left: 50 },
  { p: 0.55, left: 50 },
  { p: 0.65, left: 0 },
  { p: 0.78, left: 50 },
  { p: 0.86, left: 50 },
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
    return { left: 50, opacity: 1 - t };
  }

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i]!;
    const b = ANCHORS[i + 1]!;
    if (clamped >= a.p && clamped <= b.p) {
      const span = b.p - a.p || 1;
      const t = smoothstep((clamped - a.p) / span);
      return { left: lerp(a.left, b.left, t), opacity: 1 };
    }
  }

  return { left: ANCHORS[0]!.left, opacity: 1 };
}

/** Copy always occupies the opposite half. */
export function copyPaneLeft(wsLeft: number): number {
  return wsLeft >= 25 ? 0 : 50;
}
