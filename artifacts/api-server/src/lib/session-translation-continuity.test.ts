import assert from "node:assert/strict";
import { test } from "node:test";

import { detectSessionContinuityCues } from "./session-translation-continuity.js";

test("detects a medical topic from repeated clinical words", () => {
  const cues = detectSessionContinuityCues(
    "The doctor at the clinic said the prescription for diabetes is ready. The nurse will check blood sugar.",
  );
  assert.ok(cues.topics.some((t) => t.includes("medical")));
});

test("does not invent a topic from a short interpreter intro", () => {
  const cues = detectSessionContinuityCues("Hello my name is Sara.");
  assert.deepEqual(cues.topics, []);
  assert.equal(cues.speakerGender, "unknown");
  assert.equal(cues.timeframe, "unknown");
});

test("locks speaker gender when the speaker marks it", () => {
  const cues = detectSessionContinuityCues("I'm a mother and I need help with my appointment today.");
  assert.equal(cues.speakerGender, "female");
});

test("locks another person's gender from repeated she/her", () => {
  const cues = detectSessionContinuityCues(
    "She said she will bring her papers. I told her the office is open.",
  );
  assert.equal(cues.otherGender, "female");
});

test("detects a past story vs something happening now", () => {
  const past = detectSessionContinuityCues(
    "Yesterday he went to court. The judge said the hearing happened last week. He told me what was said.",
  );
  assert.equal(past.timeframe, "past");
  const now = detectSessionContinuityCues(
    "I need the form today. They are going to call right now. I want help and I am waiting.",
  );
  assert.equal(now.timeframe, "present");
});
