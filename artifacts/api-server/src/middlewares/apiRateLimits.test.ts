import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";

import {
  isAuthHeartbeatPost,
  isGoogleOAuthBrowserPath,
} from "./apiRateLimits.js";

function fakeReq(partial: {
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
}): Request {
  return partial as unknown as Request;
}

describe("auth rate-limit path helpers", () => {
  it("treats Google OAuth start and callbacks as browser OAuth paths", () => {
    assert.equal(isGoogleOAuthBrowserPath(fakeReq({ method: "GET", originalUrl: "/api/auth/google" })), true);
    assert.equal(
      isGoogleOAuthBrowserPath(fakeReq({ method: "GET", originalUrl: "/api/auth/google?ref=1" })),
      true,
    );
    assert.equal(
      isGoogleOAuthBrowserPath(fakeReq({ method: "GET", originalUrl: "/api/auth/google/callback?code=x" })),
      true,
    );
    assert.equal(
      isGoogleOAuthBrowserPath(fakeReq({ method: "GET", originalUrl: "/api/auth/callback/google" })),
      true,
    );
    assert.equal(isGoogleOAuthBrowserPath(fakeReq({ method: "POST", originalUrl: "/api/auth/google" })), false);
    assert.equal(isGoogleOAuthBrowserPath(fakeReq({ method: "GET", originalUrl: "/api/auth/me" })), false);
  });

  it("detects auth session heartbeat posts", () => {
    assert.equal(isAuthHeartbeatPost(fakeReq({ method: "POST", originalUrl: "/api/auth/heartbeat" })), true);
    assert.equal(isAuthHeartbeatPost(fakeReq({ method: "GET", originalUrl: "/api/auth/heartbeat" })), false);
  });
});
