import { normalizeVoiceActorId, type VoiceActorId } from "@/lib/constants/languages";

export const VOICE_FAVORITES_KEY = "interpreterai_voice_favorites";

export function listVoiceFavorites(): VoiceActorId[] {
  try {
    const raw = localStorage.getItem(VOICE_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => normalizeVoiceActorId(id))
      .filter((id, i, arr) => arr.indexOf(id) === i);
  } catch {
    return [];
  }
}

export function isVoiceFavorite(id: VoiceActorId): boolean {
  return listVoiceFavorites().includes(id);
}

export function toggleVoiceFavorite(id: VoiceActorId): VoiceActorId[] {
  const current = listVoiceFavorites();
  const next = current.includes(id) ? current.filter((v) => v !== id) : [id, ...current];
  localStorage.setItem(VOICE_FAVORITES_KEY, JSON.stringify(next.slice(0, 24)));
  return next;
}
