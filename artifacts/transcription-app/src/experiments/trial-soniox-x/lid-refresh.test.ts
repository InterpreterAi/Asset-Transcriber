import { describe, expect, it } from "vitest";
import { shouldRefreshSonioxLidAfterMonolingualLock, spokenOriginalLangs } from "./lid-refresh";

describe("spokenOriginalLangs", () => {
  it("ignores translations and <end>", () => {
    expect(
      spokenOriginalLangs([
        { text: "Hello", language: "en", translation_status: "original" },
        { text: "مرحبا", language: "ar", translation_status: "translation" },
        { text: "<end>" },
      ]),
    ).toEqual(["en"]);
  });
});

describe("shouldRefreshSonioxLidAfterMonolingualLock", () => {
  it("stays quiet until enough one-language originals", () => {
    expect(
      shouldRefreshSonioxLidAfterMonolingualLock({
        origLangs: Array(10).fill("en"),
        langA: "en",
        langB: "ar",
        origCountAtLastRefresh: 0,
      }),
    ).toBe(false);
  });

  it("refreshes after a long English-only stretch in an EN-AR pair", () => {
    expect(
      shouldRefreshSonioxLidAfterMonolingualLock({
        origLangs: Array(40).fill("en"),
        langA: "en",
        langB: "ar",
        origCountAtLastRefresh: 0,
      }),
    ).toBe(true);
  });

  it("refreshes again after more English even if Arabic appeared earlier", () => {
    expect(
      shouldRefreshSonioxLidAfterMonolingualLock({
        origLangs: [...Array(10).fill("ar"), ...Array(40).fill("en")],
        langA: "en",
        langB: "ar",
        origCountAtLastRefresh: 10,
      }),
    ).toBe(true);
  });

  it("does not refresh when the recent tail mixed both pair languages", () => {
    expect(
      shouldRefreshSonioxLidAfterMonolingualLock({
        origLangs: [...Array(39).fill("en"), "ar"],
        langA: "en",
        langB: "ar",
        origCountAtLastRefresh: 0,
      }),
    ).toBe(false);
  });

  it("waits for another monolingual stretch after a refresh", () => {
    expect(
      shouldRefreshSonioxLidAfterMonolingualLock({
        origLangs: Array(40).fill("en"),
        langA: "en",
        langB: "ar",
        origCountAtLastRefresh: 40,
      }),
    ).toBe(false);
    expect(
      shouldRefreshSonioxLidAfterMonolingualLock({
        origLangs: Array(80).fill("en"),
        langA: "en",
        langB: "ar",
        origCountAtLastRefresh: 40,
      }),
    ).toBe(true);
  });
});
