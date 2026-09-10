import { describe, expect, it } from "vitest";

import { applyMorsyChunkV2BidiIsolates } from "./morsy-chunk-v2-bidi-render";

const LRI = "\u2066";
const PDI = "\u2069";

describe("applyMorsyChunkV2BidiIsolates phones", () => {
  it("wraps 1-888-642-7434 as one LTR island", () => {
    const src = "حسناً. هذا هو 1-888-642-7434.";
    const out = applyMorsyChunkV2BidiIsolates(src);
    expect(out).toContain(`${LRI}1-888-642-7434${PDI}`);
    expect(out.includes(`${LRI}1${PDI}`)).toBe(false);
    expect(out.includes(`${LRI}888${PDI}`)).toBe(false);
  });

  it("wraps spaced phone 349 676 4432 as one LTR island", () => {
    const src = "ورقم هاتفي هو 349 676 4432.";
    const out = applyMorsyChunkV2BidiIsolates(src);
    expect(out).toContain(`${LRI}349 676 4432${PDI}`);
    expect(out.includes(`${LRI}349${PDI}`)).toBe(false);
  });

  it("does not rewrite LTR-only English", () => {
    const src = "Yes, that's 1-888-642-7434.";
    const out = applyMorsyChunkV2BidiIsolates(src);
    expect(out).toContain(`${LRI}1-888-642-7434${PDI}`);
  });
});
