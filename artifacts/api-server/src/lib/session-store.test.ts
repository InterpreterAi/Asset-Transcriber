import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  applyLiveSnapshotMicLabel,
  ensureLiveSnapshot,
  isFreshSessionHeartbeat,
  isPlaceholderAudioLabel,
  liveSessionPresence,
  sessionStore,
} from "./session-store.js";

describe("admin live presence", () => {
  beforeEach(() => sessionStore.clear());

  it("treats a placeholder Live label as not a mic/tab source", () => {
    assert.equal(isPlaceholderAudioLabel("Live"), true);
    assert.equal(isPlaceholderAudioLabel("Browser Tab Audio"), false);
    assert.equal(isPlaceholderAudioLabel("MacBook Pro Microphone"), false);
  });

  it("counts a fresh heartbeat as live without inventing a microphone", () => {
    const now = Date.now();
    const p = liveSessionPresence(9, new Date(now - 5_000), now);
    assert.equal(p.hasSnapshot, true);
    assert.equal(p.micLabel, null);
  });

  it("keeps tab vs mic from the client heartbeat", () => {
    ensureLiveSnapshot(3, { langA: "en", langB: "ar" });
    applyLiveSnapshotMicLabel(3, "Browser Tab Audio");
    const p = liveSessionPresence(3, new Date(), Date.now());
    assert.equal(p.hasSnapshot, true);
    assert.equal(p.micLabel, "Browser Tab Audio");
  });

  it("parses lastActivityAt ISO strings from Postgres", () => {
    assert.equal(isFreshSessionHeartbeat(new Date().toISOString()), true);
  });
});
