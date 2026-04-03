/**
 * Soniox STT master API key (server-side only). Never send to the browser except via minted temp keys.
 * Checks a small alias list so Railway misnamed vars still work; primary remains SONIOX_API_KEY.
 */

function stripQuotes(t: string): string {
  let s = t.trim();
  if (s === "") return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** First non-empty env value wins (canonical name first). */
export function getSonioxMasterApiKey(): string | undefined {
  for (const name of ["SONIOX_API_KEY", "SONIOX_STT_API_KEY"] as const) {
    const v = process.env[name];
    if (v == null) continue;
    const t = stripQuotes(v);
    if (t !== "") return t;
  }
  return undefined;
}

/** Which env keys are non-empty (names only). */
export function getSonioxKeyEnvPresence(): { SONIOX_API_KEY: boolean; SONIOX_STT_API_KEY: boolean } {
  return {
    SONIOX_API_KEY: Boolean(stripQuotes(process.env.SONIOX_API_KEY ?? "")),
    SONIOX_STT_API_KEY: Boolean(stripQuotes(process.env.SONIOX_STT_API_KEY ?? "")),
  };
}
