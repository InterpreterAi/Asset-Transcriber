/**
 * Interpreter-script cleanup on the **server** translate path so ordering with
 * glossary/number masks is guaranteed. Rules are conservative (whole phrases / clear errors only).
 */

type PhraseRule = { pattern: RegExp; replacement: string };

const RULES: PhraseRule[] = [
  // Interpreter ID (not phone): MT often turns "my number" into "phone number" in Arabic, etc.
  {
    pattern: /\bmy\s+number\s+is\s+(\d{4,})\b/gi,
    replacement: "my interpreter ID is $1",
  },
  {
    pattern: /\band\s+my\s+number\s+is\s+(\d{4,})\b/gi,
    replacement: "and my interpreter ID is $1",
  },
  {
    pattern: /\bfollowing\s+you\s+are\s+through\s+to\b/gi,
    replacement: "You are through to",
  },
  {
    pattern: /\bfollowing\s+you'?re\s+through\s+to\b/gi,
    replacement: "You're through to",
  },
  {
    pattern: /\byou\s+are\s+through\s+too\b/gi,
    replacement: "you are through to",
  },
  {
    pattern: /\byou'?re\s+through\s+too\b/gi,
    replacement: "you're through to",
  },
  {
    pattern: /\bthank\s+you\s+for\s+calling\s+your\s+through\b/gi,
    replacement: "thank you for calling, you're through",
  },
  {
    pattern: /\bcalling\s+your\s+through\b/gi,
    replacement: "calling, you're through",
  },
];

export function applyInterpreterPhrasePretranslate(text: string): string {
  if (!text) return text;
  let s = text;
  for (const { pattern, replacement } of RULES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}
