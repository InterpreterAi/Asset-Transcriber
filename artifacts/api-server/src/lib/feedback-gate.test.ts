import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMandatoryFeedbackThresholdMinutes,
  TRIAL_MANDATORY_FEEDBACK_AFTER_MINUTES,
} from "./feedback-gate.js";

describe("getMandatoryFeedbackThresholdMinutes", () => {
  it("requires feedback after 1 hour for the standard 2h trial", () => {
    assert.equal(getMandatoryFeedbackThresholdMinutes(120), 60);
    assert.equal(TRIAL_MANDATORY_FEEDBACK_AFTER_MINUTES, 60);
  });

  it("still requires at 1 hour when the daily cap is longer", () => {
    assert.equal(getMandatoryFeedbackThresholdMinutes(240), 60);
  });

  it("caps at the daily limit when the trial day is shorter than 1 hour", () => {
    assert.equal(getMandatoryFeedbackThresholdMinutes(45), 45);
  });
});

describe("trial mandatory feedback cadence", () => {
  it("documents once-per-app-day gating (hasMandatoryFeedbackGateSatisfied delegates to today)", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./feedback-gate.ts", import.meta.url), "utf8"),
    );
    assert.match(src, /hasSubmittedTrialMandatoryFeedbackToday/);
    assert.match(src, /each trial day/);
    assert.doesNotMatch(src, /once per account, ever/);
  });
});
