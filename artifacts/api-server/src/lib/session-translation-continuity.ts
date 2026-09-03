/**
 * Session-only translation continuity: topic, gender, and tense already
 * observed in this call. Evidence only — never invent. Used by OpenAI;
 * Libre/Hetzner cannot take this prompt.
 */

import type { SessionSnapshot } from "./session-store.js";
import { sessionStore } from "./session-store.js";

const INTERPRETER_BOILERPLATE =
  /\b(through to the|thank you for calling|my name is|my (id )?number is|short clear phrases|remain confidential|interpreter)\b/i;

type TopicHit = { id: string; label: string; re: RegExp };

const TOPIC_BUCKETS: readonly TopicHit[] = [
  { id: "medical", label: "medical / clinical", re: /\b(doctor|clinic|hospital|nurse|pain|blood|prescription|diabetes|surgery|symptom|medication|mri|x-?ray|pregnant|allergy|dosage|patient|diagnosis|vaccine|insulin|colonoscopy|biopsy)\b/i },
  { id: "legal", label: "legal / court", re: /\b(court|judge|attorney|lawyer|hearing|plaintiff|defendant|custody|asylum|deport|subpoena|testimony|verdict|probation|felony|injunction)\b/i },
  { id: "insurance", label: "insurance / claims", re: /\b(insurance|premium|deductible|claim|coverage|adjuster|liability|beneficiary|policy|copay|collision)\b/i },
  { id: "immigration", label: "immigration", re: /\b(visa|green card|citizenship|naturalization|immigration|asylum|deportation|uscis|passport)\b/i },
  { id: "family", label: "family / household", re: /\b(husband|wife|spouse|children|child|daughter|son|mother|father|pregnant|divorce|custody|school)\b/i },
  { id: "housing", label: "housing", re: /\b(landlord|rent|eviction|apartment|lease|mortgage|tenant|utilities)\b/i },
  { id: "employment", label: "work / employment", re: /\b(employer|paycheck|wages|job|workplace|fired|unemployment|overtime|hr department)\b/i },
  { id: "education", label: "school / education", re: /\b(school|teacher|student|homework|tuition|grade|principal|iep)\b/i },
  { id: "finance", label: "money / benefits", re: /\b(social security|ssi|medicaid|medicare|bank|account|payment|benefits|disability)\b/i },
];

export type SessionContinuityCues = {
  topics: string[];
  speakerGender: "male" | "female" | "unknown";
  otherGender: "male" | "female" | "mixed" | "unknown";
  timeframe: "past" | "present" | "mixed" | "unknown";
};

function sessionSpeech(snap: SessionSnapshot): string {
  const lines = snap.transcriptLines?.length
    ? snap.transcriptLines
    : snap.transcript
      ? [snap.transcript]
      : [];
  return lines.filter((l) => l.trim() && !INTERPRETER_BOILERPLATE.test(l)).join("\n");
}

function count(re: RegExp, text: string): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) ?? []).length;
}

export function detectSessionContinuityCues(text: string): SessionContinuityCues {
  const t = text.trim();
  const topics = TOPIC_BUCKETS.filter((b) => count(b.re, t) >= 2).map((b) => b.label);
  if (topics.length === 0) {
    const single = TOPIC_BUCKETS.find((b) => count(b.re, t) >= 1 && t.length >= 80);
    if (single) topics.push(single.label);
  }

  const maleSelf = count(/\b(i am a (man|male)|i'?m (a )?(man|male|husband|father))\b/i, t);
  const femaleSelf = count(/\b(i am a (woman|female)|i'?m (a )?(woman|female|wife|mother)|i am pregnant)\b/i, t);
  const arMaleSelf = count(/أنا\s+(رجل|زوج|أب)/u, t);
  const arFemaleSelf = count(/أنا\s+(امرأة|زوجة|أم)|حامل/u, t);
  let speakerGender: SessionContinuityCues["speakerGender"] = "unknown";
  if (maleSelf + arMaleSelf >= 1 && femaleSelf + arFemaleSelf === 0) speakerGender = "male";
  else if (femaleSelf + arFemaleSelf >= 1 && maleSelf + arMaleSelf === 0) speakerGender = "female";

  const he = count(/\b(he|him|his)\b/i, t);
  const she = count(/\b(she|her|hers)\b/i, t);
  let otherGender: SessionContinuityCues["otherGender"] = "unknown";
  if (he >= 2 && she === 0) otherGender = "male";
  else if (she >= 2 && he === 0) otherGender = "female";
  else if (he >= 2 && she >= 2) otherGender = "mixed";

  const past = count(/\b(was|were|had|did|went|said|told|happened|yesterday|last (week|year|night)|ago)\b/i, t);
  const present = count(/\b(is|are|am|do|does|need|want|will|going to|right now|today)\b/i, t);
  let timeframe: SessionContinuityCues["timeframe"] = "unknown";
  if (past >= 3 && present <= 1) timeframe = "past";
  else if (present >= 3 && past <= 1) timeframe = "present";
  else if (past >= 2 && present >= 2) timeframe = "mixed";

  return { topics, speakerGender, otherGender, timeframe };
}

const ALWAYS_ON_RULES =
  `SESSION CONTINUITY (match this call — do not invent):\n` +
  `- Keep the same official-register wording for the same person, place, and topic term already used in this session. Do not synonym-flip mid-call.\n` +
  `- Gender: if THIS utterance marks the speaker or another person (he/she, husband/wife, أنا + gendered verb, soy médico/médica), keep that gender in the translation. If this session already established a person's gender, stay with it. If gender is still unmarked, do not invent one.\n` +
  `- Time: if this is a past story (was/went/had, كان/ذهب), keep past. If it is happening now, keep present. Do not flatten a narrative into the present or a live request into the past.\n` +
  `- Topic: use the vocabulary of what THIS session is actually about (any domain). Do not default every line to generic medical/legal wording unless the speakers are in that domain.\n` +
  `- Never add facts, names, or explanations the speaker did not say.\n`;

function observedLines(cues: SessionContinuityCues): string {
  const bits: string[] = [];
  if (cues.topics.length) bits.push(`- Topic observed so far in this session: ${cues.topics.join("; ")}. Stay with those words.`);
  if (cues.speakerGender !== "unknown") {
    bits.push(`- Speaker gender already marked in this session: ${cues.speakerGender}. Keep matching it when grammar requires gender.`);
  }
  if (cues.otherGender === "male" || cues.otherGender === "female") {
    bits.push(`- Another person in this session is referred to as ${cues.otherGender}. Keep that gender.`);
  }
  if (cues.timeframe === "past") bits.push("- This session has been telling a past story. Keep past tense for those events.");
  else if (cues.timeframe === "present") bits.push("- This session is about what is happening now. Keep present/near-future.");
  else if (cues.timeframe === "mixed") bits.push("- This session mixes a past story with present speech. Match the tense of each utterance.");
  if (!bits.length) return "";
  return `Observed in this session only:\n${bits.join("\n")}\n`;
}

/** OpenAI prompt add-on. Empty snapshot still gets the always-on match rules. */
export function sessionContinuityPromptBlock(sessionId: number, _tgtDisplayName: string): string {
  const snap = sessionStore.get(sessionId);
  const speech = snap ? sessionSpeech(snap) : "";
  const cues = speech.trim().length >= 24
    ? detectSessionContinuityCues(speech)
    : { topics: [], speakerGender: "unknown", otherGender: "unknown", timeframe: "unknown" } as SessionContinuityCues;
  return ALWAYS_ON_RULES + observedLines(cues) + "\n";
}
