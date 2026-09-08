import { describe, expect, it } from "vitest";

import {
  applyMorsyChunkV2BidiIsolates,
  renderMorsyChunkV2BidiHtml,
  stripMorsyChunkV2BidiIsolates,
} from "./morsy-chunk-v2-bidi-render";

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

  it("does not rewrite LTR-only English", () => {
    const src = "Yes, that's 1-888-642-7434.";
    const out = applyMorsyChunkV2BidiIsolates(src);
    expect(out).toContain(`${LRI}1-888-642-7434${PDI}`);
  });
});

describe("renderMorsyChunkV2BidiHtml", () => {
  it("uses bdi elements so plain text has no unicode isolates", () => {
    const src = "Castle Black هو موطني الآن.";
    const html = renderMorsyChunkV2BidiHtml(src);
    expect(html).toContain('<bdi dir="ltr">Castle</bdi>');
    expect(html).toContain('<bdi dir="ltr">Black</bdi>');
    expect(html).not.toContain(LRI);
    expect(html).not.toContain(PDI);
    expect(stripMorsyChunkV2BidiIsolates(html.replace(/<[^>]+>/g, ""))).toContain("Castle");
  });

  it("escapes HTML in non-wrapped Arabic", () => {
    const html = renderMorsyChunkV2BidiHtml("احذر <b>خطر</b> Winterfell");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain('<bdi dir="ltr">Winterfell</bdi>');
  });
});

describe("stripMorsyChunkV2BidiIsolates", () => {
  it("removes LRI/PDI from copied text", () => {
    expect(stripMorsyChunkV2BidiIsolates(`${LRI}Ah${PDI}, I ${LRI}understand${PDI}`)).toBe(
      "Ah, I understand",
    );
  });
});
