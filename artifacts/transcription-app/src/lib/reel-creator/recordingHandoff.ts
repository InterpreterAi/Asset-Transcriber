/** Cross-window handoff: Admin Marketing Demo → Reel Creator assembler. */

export const REEL_HANDOFF_READY = "interpreterai-reel-ready";
export const REEL_HANDOFF_PAYLOAD = "interpreterai-reel-recording";

export type ReelHandoffPayload = {
  type: typeof REEL_HANDOFF_PAYLOAD;
  filename: string;
  mimeType: string;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  fps: number;
};

export function isReelHandoffPayload(data: unknown): data is ReelHandoffPayload {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === REEL_HANDOFF_PAYLOAD &&
    typeof d.filename === "string" &&
    typeof d.mimeType === "string" &&
    d.buffer instanceof ArrayBuffer
  );
}

export function defaultReelCreatorUrl(): string {
  try {
    const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ?.VITE_REEL_CREATOR_URL;
    if (fromEnv) return fromEnv;
  } catch {
    /* ignore */
  }
  return "http://localhost:5179/";
}

/**
 * Save MP4 + open Reel Creator + postMessage the bytes (transferable).
 */
export async function handoffRecordingToReelCreator(opts: {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  fps: number;
  reelCreatorUrl?: string;
}): Promise<void> {
  const { blob, width, height, fps } = opts;
  const filename = opts.filename.endsWith(".mp4") ? opts.filename : `${opts.filename}.mp4`;
  const url = opts.reelCreatorUrl ?? defaultReelCreatorUrl();

  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(dlUrl), 30_000);

  const target = window.open(`${url}${url.includes("?") ? "&" : "?"}handoff=1`, "interpreterai-reel-creator");
  if (!target) {
    throw new Error(
      "Popup blocked — allow popups for Reel Creator. Your MP4 was still downloaded.",
    );
  }

  const send = async () => {
    const buffer = await blob.arrayBuffer();
    const payload: ReelHandoffPayload = {
      type: REEL_HANDOFF_PAYLOAD,
      filename,
      mimeType: blob.type || "video/mp4",
      buffer,
      width,
      height,
      fps,
    };
    target.postMessage(payload, "*", [payload.buffer]);
  };

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve();
    };

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== target) return;
      if (ev.data?.type !== REEL_HANDOFF_READY) return;
      void send().finally(finish);
    };

    const timeout = window.setTimeout(() => {
      void send().finally(finish);
    }, 6000);

    window.addEventListener("message", onMessage);
    try {
      target.postMessage({ type: "interpreterai-reel-ping" }, "*");
    } catch {
      /* ignore */
    }
  });
}
