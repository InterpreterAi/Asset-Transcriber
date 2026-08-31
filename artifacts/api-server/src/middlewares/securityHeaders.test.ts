import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContentSecurityPolicy } from "./securityHeaders.js";

describe("Content-Security-Policy for Paddle.js", () => {
  it("allows the Paddle.js CDN and checkout frames", () => {
    const csp = buildContentSecurityPolicy(true);
    assert.match(csp, /script-src[^;]*https:\/\/cdn\.paddle\.com/);
    assert.match(csp, /frame-src[^;]*https:\/\/buy\.paddle\.com/);
    assert.match(csp, /style-src[^;]*https:\/\/cdn\.paddle\.com/);
  });

  it("still forbids framing InterpreterAI pages", () => {
    const csp = buildContentSecurityPolicy(true);
    assert.match(csp, /frame-ancestors 'none'/);
  });
});
