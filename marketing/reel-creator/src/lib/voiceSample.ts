/**
 * Short voice previews — static MP3 when available, else live TTS via api-server.
 */

import {
  getVoiceActor,
  normalizeVoiceActorId,
  type VoiceActorId,
} from "@/lib/constants/languages";
import type { WorkspaceDeliveryPresetId } from "@/lib/workspaceDeliveryPresets";
import { DELIVERY_PREVIEW_LINE } from "@/lib/workspaceDeliveryPresets";

export const VOICE_SAMPLE_LINE = "Real-time interpretation, naturally delivered.";

const MEMORY = new Map<string, Blob>();

function cacheKey(voiceId: VoiceActorId, language: string, delivery?: string): string {
  return delivery ? `${voiceId}:${language}:${delivery}` : `${voiceId}:${language}`;
}

function reelBuilderHeaders(): HeadersInit {
  const key = import.meta.env.VITE_REEL_BUILDER_API_KEY as string | undefined;
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (key) h["x-reel-builder-key"] = key;
  return h;
}

/** URLs the browser can fetch without ElevenLabs API auth. */
export function isDirectPreviewUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  return url.includes("storage.googleapis.com");
}

async function fetchPreviewBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Voice preview failed (${res.status})`);
  const blob = await res.blob();
  if (!blob.size) throw new Error("Voice preview missing audio");
  return blob;
}

async function fetchTtsPreviewBlob(
  voiceId: VoiceActorId,
  language: string,
  text: string,
  delivery?: WorkspaceDeliveryPresetId,
): Promise<Blob> {
  const res = await fetch("/api/reel-builder/tts", {
    method: "POST",
    headers: reelBuilderHeaders(),
    body: JSON.stringify({
      text,
      voice: voiceId,
      language,
      speed: 1,
      withTimestamps: false,
      ...(delivery ? { delivery } : {}),
    }),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(
      raw.includes("Unauthorized") || res.status === 401
        ? "Preview auth failed — check VITE_REEL_BUILDER_API_KEY"
        : res.status === 404 || res.status === 502
          ? "Preview unavailable — start api-server on :8787"
          : `TTS preview failed (${res.status})`,
    );
  }
  const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
  if (!data.audioBase64) throw new Error("TTS preview missing audio");
  const bin = atob(data.audioBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: data.mimeType || "audio/mpeg" });
}

export async function fetchVoiceSampleBlob(
  voiceId: VoiceActorId,
  language = "en",
): Promise<Blob> {
  const id = normalizeVoiceActorId(voiceId);
  const key = cacheKey(id, language);
  const cached = MEMORY.get(key);
  if (cached) return cached;

  const url = getVoiceActor(id).previewUrl;
  if (isDirectPreviewUrl(url)) {
    try {
      const blob = await fetchPreviewBlob(url);
      MEMORY.set(key, blob);
      return blob;
    } catch {
      /* fall through to TTS */
    }
  }

  const blob = await fetchTtsPreviewBlob(id, language, VOICE_SAMPLE_LINE);
  MEMORY.set(key, blob);
  return blob;
}

export async function fetchVoiceSampleWithDeliveryBlob(
  voiceId: VoiceActorId,
  language: string,
  delivery: WorkspaceDeliveryPresetId,
  text = DELIVERY_PREVIEW_LINE,
): Promise<Blob> {
  const id = normalizeVoiceActorId(voiceId);
  const key = cacheKey(id, language, delivery);
  const cached = MEMORY.get(key);
  if (cached) return cached;
  const blob = await fetchTtsPreviewBlob(id, language, text, delivery);
  MEMORY.set(key, blob);
  return blob;
}

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;

export function stopVoiceSamplePlayback(): void {
  activeAudio?.pause();
  activeAudio = null;
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export async function playVoiceSample(
  voiceId: VoiceActorId,
  language = "en",
  onStart?: () => void,
): Promise<void> {
  stopVoiceSamplePlayback();
  const blob = await fetchVoiceSampleBlob(voiceId, language);
  await playBlob(blob, onStart);
}

export async function playVoiceSampleWithDelivery(
  voiceId: VoiceActorId,
  language: string,
  delivery: WorkspaceDeliveryPresetId,
  text = DELIVERY_PREVIEW_LINE,
  onStart?: () => void,
): Promise<void> {
  stopVoiceSamplePlayback();
  const blob = await fetchVoiceSampleWithDeliveryBlob(voiceId, language, delivery, text);
  await playBlob(blob, onStart);
}

async function playBlob(blob: Blob, onStart?: () => void): Promise<void> {
  const url = URL.createObjectURL(blob);
  activeUrl = url;
  const audio = new Audio(url);
  activeAudio = audio;
  await new Promise<void>((resolve, reject) => {
    audio.onplaying = () => onStart?.();
    audio.onended = () => {
      stopVoiceSamplePlayback();
      resolve();
    };
    audio.onerror = () => {
      stopVoiceSamplePlayback();
      reject(new Error("Playback failed"));
    };
    void audio.play().catch(reject);
  });
}
