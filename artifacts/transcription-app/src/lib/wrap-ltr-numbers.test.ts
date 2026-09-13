import { describe, expect, it } from "vitest";

import {
  isolateLtrRunsInRtl,
  isolateRtlRunsInLtr,
  LRI,
  PDI,
  prepareMixedScriptOriginal,
  RLI,
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

describe("mixed EN↔AR Original paint", () => {
  it("isolates Arabic runs inside an English (LTR) row", () => {
    const src = "Hello مرحبا how are you؟";
    const out = prepareMixedScriptOriginal(src, "en", false);
    expect(out).toContain(`${RLI}مرحبا${PDI}`);
    expect(out.startsWith("Hello")).toBe(true);
  });

  it("isolates Latin runs inside an Arabic (RTL) row", () => {
    const src = "مرحبا Mohammed اليوم";
    const out = prepareMixedScriptOriginal(src, "ar", true);
    expect(out).toContain(`${LRI}Mohammed${PDI}`);
  });

  it("isolateRtlRunsInLtr keeps English reading order around Arabic", () => {
    const src = "I said اهلا then left";
    const out = isolateRtlRunsInLtr(src);
    expect(out).toBe(`I said ${RLI}اهلا${PDI} then left`);
  });
});
