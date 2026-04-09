import type { LangPair } from "./interpreter-stt-context.js";
import { getInterpreterDemonyms } from "./interpreter-stt-context.js";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Rule = { pattern: RegExp; replace: string | ((sub: string, ...groups: string[]) => string) };

function buildRules(pair: LangPair): Rule[] {
  const demonyms = getInterpreterDemonyms(pair);
  const rules: Rule[] = [];

  for (const d of demonyms) {
    const u = escapeRe(d);
    const canonYoure = `you're through to the ${d} interpreter`;
    const canonYouAre = `you are through to the ${d} interpreter`;
    const canonThanks = `thank you for calling the ${d} interpreter`;

    rules.push(
      {
        pattern: new RegExp(
          `\\byour\\s+through\\s+(?:too|two)\\s+the\\s+${u}\\s+interpreter\\b`,
          "gi",
        ),
        replace: canonYoure,
      },
      {
        pattern: new RegExp(`\\byour\\s+through\\s+to\\s+the\\s+${u}\\s+interpreter\\b`, "gi"),
        replace: canonYoure,
      },
      {
        pattern: new RegExp(
          `\\byou'?re\\s+through\\s+too\\s+the\\s+${u}\\s+interpreter\\b`,
          "gi",
        ),
        replace: canonYoure,
      },
      {
        pattern: new RegExp(
          `\\byou\\s+are\\s+through\\s+(?:too|two)\\s+the\\s+${u}\\s+interpreter\\b`,
          "gi",
        ),
        replace: canonYouAre,
      },
      {
        pattern: new RegExp(
          `\\bthank\\s+you\\s+four\\s+calling\\s+the\\s+${u}\\s+interpreter\\b`,
          "gi",
        ),
        replace: canonThanks,
      },
    );
  }

  rules.push(
    {
      pattern: /\bfollowing\s+you\s+are\s+through\s+to\b/gi,
      replace: "You are through to",
    },
    {
      pattern: /\bfollowing\s+you'?re\s+through\s+to\b/gi,
      replace: "You're through to",
    },
    {
      pattern: /\byou\s+are\s+through\s+too\b/gi,
      replace: "you are through to",
    },
    {
      pattern: /\byou'?re\s+through\s+too\b/gi,
      replace: "you're through to",
    },
    {
      pattern: /\bthank\s+you\s+for\s+calling\s+your\s+through\b/gi,
      replace: "thank you for calling, you're through",
    },
    {
      pattern: /\bcalling\s+your\s+through\b/gi,
      replace: "calling, you're through",
    },
    {
      pattern: /\bplease\s+speak\s+in\s+shore\s+clear\s+phrases\b/gi,
      replace: "please speak in short clear phrases",
    },
    {
      pattern: /\bplease\s+speak\s+in\s+short\s+clear\s+frazes\b/gi,
      replace: "please speak in short clear phrases",
    },
    {
      pattern:
        /\ball\s+information\s+discussion\s+will\s+remain\s+confidential\b/gi,
      replace: "all information discussed will remain confidential",
    },
    {
      pattern:
        /\ball\s+information\s+discussed\s+will\s+remain\s+confidencial\b/gi,
      replace: "all information discussed will remain confidential",
    },
    {
      pattern:
        /\bmy\s+name\s+is\s+([A-Za-z][A-Za-z\s.'-]{0,48}?)\s+and\s+my\s+number\s+is\b/gi,
      replace: (_sub, name) => `my name is ${String(name).trim()} and my number is`,
    },
  );

  return rules;
}

/**
 * Corrects **only** known misheard variants of standard interpreter English scripts.
 * Does not alter general conversation text outside these patterns.
 */
export function normalizeInterpreterTranscript(raw: string, pair: LangPair): string {
  if (!raw || !raw.trim()) return raw;

  let s = raw;
  for (const { pattern, replace } of buildRules(pair)) {
    if (typeof replace === "string") {
      s = s.replace(pattern, replace);
    } else {
      s = s.replace(pattern, replace);
    }
  }
  return s;
}
