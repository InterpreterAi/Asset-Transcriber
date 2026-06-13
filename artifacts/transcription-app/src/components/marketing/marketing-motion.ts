/** Shared Framer Motion presets for public marketing pages. */
export const marketingEase = [0.22, 1, 0.36, 1] as const;

export function marketingFade(delay = 0) {
  return {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.65, ease: marketingEase, delay },
  };
}

export function marketingFadeX(delay = 0, from = -32) {
  return {
    initial: { opacity: 0, x: from },
    whileInView: { opacity: 1, x: 0 },
    viewport: { once: true, margin: "-60px" },
    transition: { duration: 0.6, ease: marketingEase, delay },
  };
}

export function marketingScale(delay = 0) {
  return {
    initial: { opacity: 0, scale: 0.92 },
    whileInView: { opacity: 1, scale: 1 },
    viewport: { once: true, margin: "-60px" },
    transition: { duration: 0.55, ease: marketingEase, delay },
  };
}
