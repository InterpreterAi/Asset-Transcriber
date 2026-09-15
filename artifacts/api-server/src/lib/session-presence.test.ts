import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionPresenceKey, verifySessionPresenceKey } from "./session-presence.js";

describe("session presence HMAC", () => {
  it("accepts the key for the same user and session", () => {
    const key = sessionPresenceKey(42, 99);
    assert.equal(verifySessionPresenceKey(42, 99, key), true);
  });

  it("rejects another session or user", () => {
    const key = sessionPresenceKey(42, 99);
    assert.equal(verifySessionPresenceKey(42, 100, key), false);
    assert.equal(verifySessionPresenceKey(7, 99, key), false);
    assert.equal(verifySessionPresenceKey(42, 99, "nope"), false);
    assert.equal(verifySessionPresenceKey(42, 99, ""), false);
  });
});
