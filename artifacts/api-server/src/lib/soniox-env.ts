/**
 * Soniox STT master API key (server-side only). Never send to the browser except via minted temp keys.
 * Accepts aliases and case-insensitive names (Railway / copy-paste typos).
 */

/** Resolution order: first non-empty wins. */
const SONIOX_ENV_NAME_PRIORITY = [
  "SONIOX_API_KEY",
  "SONIOX_STT_API_KEY",
  "SONIOX_KEY",
  "SONIOX_API_TOKEN",
] as const;

function stripQuotes(t: string): string {
  let s = t.trim();
  if (s === "") return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function findActualEnvKeyName(wantUpper: string): string | undefined {
  if (process.env[wantUpper] !== undefined) return wantUpper;
  for (const k of Object.keys(process.env)) {
    if (k.toUpperCase() === wantUpper) return k;
  }
  return undefined;
}

function getEnvValueCaseInsensitive(wantUpper: string): { actualKey: string; raw: string } | undefined {
  const actualKey = findActualEnvKeyName(wantUpper);
  if (!actualKey) return undefined;
  const raw = process.env[actualKey];
  if (raw === undefined) return undefined;
  return { actualKey, raw };
}

export function getSonioxMasterApiKey(): string | undefined {
  const hit = firstSonioxFromEnv();
  return hit?.value;
}

/** Which env var supplied the key (actual casing on `process.env`), if any. */
export function getSonioxResolvedEnvKeyName(): string | null {
  return firstSonioxFromEnv()?.actualKey ?? null;
}

function firstSonioxFromEnv():
  | {
      actualKey: string;
      value: string;
    }
  | undefined {
  for (const logical of SONIOX_ENV_NAME_PRIORITY) {
    const found = getEnvValueCaseInsensitive(logical);
    if (!found) continue;
    const t = stripQuotes(found.raw);
    if (t !== "") return { actualKey: found.actualKey, value: t };
  }
  return undefined;
}

/** Per-canonical-name presence (checks case-insensitive match on process.env). */
export function getSonioxKeyEnvPresence(): Record<(typeof SONIOX_ENV_NAME_PRIORITY)[number], boolean> {
  const out = {} as Record<(typeof SONIOX_ENV_NAME_PRIORITY)[number], boolean>;
  for (const logical of SONIOX_ENV_NAME_PRIORITY) {
    const found = getEnvValueCaseInsensitive(logical);
    out[logical] = Boolean(found && stripQuotes(found.raw) !== "");
  }
  return out;
}
