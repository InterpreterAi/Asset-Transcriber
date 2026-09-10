import { describe, expect, it } from "vitest";

import {
  isolateLtrRunsInRtl,
  LRI,
  PDI,
  wrapAsciiDigitRunsWithLtrSpans,
} from "./wrap-ltr-numbers";

describe("isolateLtrRunsInRtl phones", () => {
  it("keeps spaced phone 349 676 4432 as one LTR island", () => {
    const src = "مرحبًا، اسمي Mohammed، ورقم هاتفي هو 349 676 4432.";
    const out = isolateLtrRunsInRtl(src);
    expect(out).toContain(`${LRI}349 676 4432${PDI}`);
    expect(out.includes(`${LRI}349${PDI}`)).toBe(false);
    expect(out.includes(`${LRI}676${PDI}`)).toBe(false);
    expect(out.includes(`${LRI}4432${PDI}`)).toBe(false);
  });

  it("keeps dashed phone 1-888-642-7434 as one island", () => {
    const src = "حسناً. هذا هو 1-888-642-7434.";
    const out = isolateLtrRunsInRtl(src);
    expect(out).toContain(`${LRI}1-888-642-7434${PDI}`);
  });

  it("isolates Latin names as LTR islands", () => {
    const src = "اسمي Mohammed اليوم";
    const out = isolateLtrRunsInRtl(src);
    expect(out).toContain(`${LRI}Mohammed${PDI}`);
  });
});

describe("wrapAsciiDigitRunsWithLtrSpans phones", () => {
  it("wraps spaced phone as one span dir=ltr", () => {
    const src = "ورقم هاتفي هو 349 676 4432.";
    const out = wrapAsciiDigitRunsWithLtrSpans(src);
    expect(out).toContain('<span dir="ltr">349 676 4432</span>');
    expect(out.includes('<span dir="ltr">349</span>')).toBe(false);
  });
});
