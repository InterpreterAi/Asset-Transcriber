/** Audio blob helpers — kept separate to avoid circular imports with generatedReel. */

import type { TimedWord } from "@/lib/kineticCaptions";

export type StitchClip = {
  blob: Blob;
  startSec: number;
  durationSec?: number;
  /** Word timestamps — trim stitch to spoken window only. */
  words?: TimedWord[];
};

export function base64ToBlob(b64: string, mimeType = "audio/mpeg"): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
