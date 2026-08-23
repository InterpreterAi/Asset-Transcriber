/** Ensure web fonts used by caption/export painters are loaded before encode. */
export async function ensureExportFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load('800 32px "Plus Jakarta Sans"'),
      document.fonts.load('800 54px "Plus Jakarta Sans"'),
      document.fonts.load("500 32px Inter"),
      document.fonts.load("600 32px Inter"),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back to system fonts */
  }
}
