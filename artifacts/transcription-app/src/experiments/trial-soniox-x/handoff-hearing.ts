/**
 * "you're through" is heard as the company name "NorthRoute", then wrapped in
 * "Thank you for calling …". Final tokens do not get revised, so the screen
 * corrects that handoff. The rest of the utterance stays.
 */

const NORTH_ROUTE = String.raw`north\s*route`;

export function correctNorthRouteHandoff(text: string): string {
  if (!text || !/north\s*route/i.test(text)) return text;
  let out = text.replace(
    new RegExp(String.raw`\bthank you for calling\s+${NORTH_ROUTE}\b`, "gi"),
    "You're through to the",
  );
  out = out.replace(new RegExp(String.raw`\b${NORTH_ROUTE}\b`, "gi"), "you're through to the");
  out = out.replace(/\bthe\s+the\b/gi, "the");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/\s+([.!?؟،])/g, "$1");
  return out;
}

export function correctNorthRouteTranslation(original: string, translation: string): string {
  if (!/north\s*route/i.test(original) || !translation) return translation;
  let out = translation;
  out = out.replace(/في\s*نورث\s*روت/g, "");
  out = out.replace(/نورث\s*روت/g, "");
  out = out.replace(/\bNorth\s*Route\b/gi, "");
  out = out.replace(/شكراً?\s*ل(?:ا)?تصالك\s*ب/g, "تم تحويلك إلى ");
  out = out.replace(/\bthank you for calling\b/gi, "you're through to");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/\s+([.!?؟،])/g, "$1");
  return out.trim();
}
