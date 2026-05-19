/**
 * Opt-in realtime STT pipeline instrumentation (browser only).
 *
 * Goal: quantify upstream Soniox stability + segment assembly BEFORE translation,
 * to separate translation-layer issues from chaotic STT / diarization / NF churn.
 *
 * Enable diagnostics:
 *   `localStorage.setItem("interpreterai_stt_pipeline_diag", "1")`
 *
 * Tag session for quiet vs noisy comparison (optional, included in reports + CSV):
 *   `localStorage.setItem("interpreterai_stt_pipeline_profile", "quiet")`   // or `"noisy"`
 *
 * After Stop: `[stt_pipeline_summary]` in console, or `window.__interpretSttPipeline.print()`
 * Spreadsheet row: `window.__interpretSttPipeline.exportCsvHeader()` + `exportCsvRow()`
 *
 * PHI warning: reports may echo structured metrics — dev machines only.
 */

import { liveBlankTraceEnabled, liveBlankTraceOnWsFrame } from "@/hooks/live-blank-trace";

/** Minimal token shape (matches Soniox streaming payloads). */
export interface SttPipelineSonioxToken {
  text: string;
  is_final: boolean;
  speaker?: number | string;
  language?: string;
}

export function sttPipelineInstrumentationEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_stt_pipeline_diag") === "1";
  } catch {
    return false;
  }
}

/** Compare sessions: `quiet` | `noisy` | default unspecified */
export function readSttPipelineSessionProfile(): "quiet" | "noisy" | "unspecified" {
  try {
    const v = localStorage.getItem("interpreterai_stt_pipeline_profile")?.trim().toLowerCase();
    if (v === "quiet" || v === "noisy") return v;
    return "unspecified";
  } catch {
    return "unspecified";
  }
}

function bucketWords(n: number): string {
  if (n <= 2) return "0-2";
  if (n <= 5) return "3-5";
  if (n <= 15) return "6-15";
  return "16+";
}

function bump(map: Record<string, number>, key: string, delta = 1): void {
  map[key] = (map[key] ?? 0) + delta;
}

function histTotal(hist: Record<string, number>): number {
  let t = 0;
  for (const v of Object.values(hist)) t += v;
  return t;
}

/** Share of histogram mass in 0-2 and 3-5 word buckets (API-bound dispatches only). */
function histShortDispatchShare(hist: Record<string, number>): number {
  const tot = histTotal(hist);
  if (tot <= 0) return 0;
  return ((hist["0-2"] ?? 0) + (hist["3-5"] ?? 0)) / tot;
}

/** Letters per Unicode script bucket (coarse, for “mixed-script fragment” proxy). */
function scriptLetterCounts(s: string): { latin: number; cyrillic: number; arabic: number; cjk: number; otherLetter: number } {
  let latin = 0;
  let cyrillic = 0;
  let arabic = 0;
  let cjk = 0;
  let otherLetter = 0;
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;
    if (cp >= 0x41 && cp <= 0x5a) {
      latin++;
      continue;
    }
    if (cp >= 0x61 && cp <= 0x7a) {
      latin++;
      continue;
    }
    if (cp >= 0xc0 && cp <= 0x24f) {
      latin++;
      continue;
    }
    if (cp >= 0x400 && cp <= 0x52f) {
      cyrillic++;
      continue;
    }
    if (cp >= 0x600 && cp <= 0x6ff) {
      arabic++;
      continue;
    }
    if (cp >= 0x750 && cp <= 0x77f) {
      arabic++;
      continue;
    }
    if (cp >= 0x3040 && cp <= 0x30ff) {
      cjk++;
      continue;
    }
    if (cp >= 0x3400 && cp <= 0x9fff) {
      cjk++;
      continue;
    }
    if (cp >= 0xac00 && cp <= 0xd7af) {
      cjk++;
      continue;
    }
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3000 && cp <= 0x303f)
    ) {
      cjk++;
      continue;
    }
    const cat = String.fromCodePoint(cp);
    if (/\p{L}/u.test(cat)) otherLetter++;
  }
  return { latin, cyrillic, arabic, cjk, otherLetter };
}

/** Non-endpoint token — caller filters. */
function isEndpointToken(t: SttPipelineSonioxToken): boolean {
  return t.text.trim().toLowerCase() === "<end>";
}

export type SttPipelineReport = {
  enabled: boolean;
  /** From localStorage `interpreterai_stt_pipeline_profile` at report build time. */
  sessionProfile: "quiet" | "noisy" | "unspecified";
  sessionWallMs: number;
  wsMessagesTotal: number;
  wsMessagesMultiRawSpeaker: number;
  wsMessagesMultiEffSpeaker: number;
  wsMessagesMultiLangTag: number;
  tokensRawEffSpeakerMismatch: number;
  speechTokensTotal: number;
  finalTokensTotal: number;
  nfTokensTotal: number;
  microFinalTokens: number;
  nfFullHypothesisReplaces: number;
  detectedLangChangesMsgToMsg: number;
  liveBufferAbsDeltaSum: number;
  liveBufferMaxAbsDelta: number;
  joinedHypothesisShrinkEvents: number;
  joinedHypothesisGrowEvents: number;
  segmentClosesSpeakerChange: number;
  segmentClosesSessionEnd: number;
  translationDispatchesTotal: number;
  translationDispatchesFinal: number;
  translationDispatchesLive: number;
  translationLiveDebounceSchedules: number;
  /**
   * Combined API-bound dispatch histogram (live + final buckets merged).
   * For quiet vs noisy comparison prefer `translationDispatchWordsHistogramLive` /
   * `translationDispatchWordsHistogramFinal`.
   */
  translationDispatchWordsHistogram: Record<string, number>;
  translationDispatchWordsHistogramLive: Record<string, number>;
  translationDispatchWordsHistogramFinal: Record<string, number>;
  translationDispatchWordsHistogramDebounceSchedule: Record<string, number>;
  translationDispatchesWithoutSentenceEnd: number;
  translationDispatchesWithoutSentenceEndLive: number;
  translationDispatchesWithoutSentenceEndFinal: number;
  translationMixedScriptHits: number;
  translationMixedScriptHitsLive: number;
  translationMixedScriptHitsFinal: number;
  /** Upstream WS metrics accumulated until the first API-bound translation dispatch. */
  preFirstTranslationDispatch: {
    wsMessages: number;
    multiEffSpeakerMsgs: number;
    multiLangTagMsgs: number;
    nfFullReplaceMsgs: number;
    joinedShrinkMsgs: number;
    langFlipMsgs: number;
    liveBufferAbsDeltaSum: number;
    liveBufferMaxAbsDelta: number;
    rates: {
      multiEffSpkPerMsg: number;
      multiLangTagPerMsg: number;
      nfReplacePerMsg: number;
      shrinkPerMsg: number;
      langFlipPerMsg: number;
      avgLiveBufAbsDelta: number;
    };
  };
  /** Reached paint pipeline with empty translation after retries (see use-transcription). */
  translationUiBlankAfterFetchLive: number;
  translationUiBlankAfterFetchFinal: number;
  /** Substantial source (≥20 chars) but still blank after fetch path. */
  translationUiBlankAfterFetchSubstantialSourceLive: number;
  translationUiBlankAfterFetchSubstantialSourceFinal: number;
  /** Translation async threw before applying text (HIPAA — errors not logged). */
  translationFetchExceptions: number;
  interpretation: {
    upstreamStressScore: number;
    rates: {
      multiRawSpkPerMsg: number;
      multiEffSpkPerMsg: number;
      multiLangTagPerMsg: number;
      nfReplacePerMsg: number;
      langFlipPerMsg: number;
      shrinkPerMsg: number;
      microFinalPerFinal: number;
      rawEffMismatchPerSpeechTok: number;
      avgLiveBufAbsDelta: number;
    };
    notes: string[];
  };
  /** Structured comparison — conservative wording; use for spreadsheets + paired runs. */
  comparison: {
    liveVsFinal: {
      shareShortDispatches_0to5Words_live: number;
      shareShortDispatches_0to5Words_final: number;
      shareNoSentenceEnd_live: number;
      shareNoSentenceEnd_final: number;
      shareMixedScript_live: number;
      shareMixedScript_final: number;
    };
    evidenceLines: string[];
  };
};

const emptyHist = (): Record<string, number> => ({});

const state: SttPipelineReport = {
  enabled: false,
  sessionProfile: "unspecified",
  sessionWallMs: 0,
  wsMessagesTotal: 0,
  wsMessagesMultiRawSpeaker: 0,
  wsMessagesMultiEffSpeaker: 0,
  wsMessagesMultiLangTag: 0,
  tokensRawEffSpeakerMismatch: 0,
  speechTokensTotal: 0,
  finalTokensTotal: 0,
  nfTokensTotal: 0,
  microFinalTokens: 0,
  nfFullHypothesisReplaces: 0,
  detectedLangChangesMsgToMsg: 0,
  liveBufferAbsDeltaSum: 0,
  liveBufferMaxAbsDelta: 0,
  joinedHypothesisShrinkEvents: 0,
  joinedHypothesisGrowEvents: 0,
  segmentClosesSpeakerChange: 0,
  segmentClosesSessionEnd: 0,
  translationDispatchesTotal: 0,
  translationDispatchesFinal: 0,
  translationDispatchesLive: 0,
  translationLiveDebounceSchedules: 0,
  translationDispatchWordsHistogram: {},
  translationDispatchWordsHistogramLive: {},
  translationDispatchWordsHistogramFinal: {},
  translationDispatchWordsHistogramDebounceSchedule: {},
  translationDispatchesWithoutSentenceEnd: 0,
  translationDispatchesWithoutSentenceEndLive: 0,
  translationDispatchesWithoutSentenceEndFinal: 0,
  translationMixedScriptHits: 0,
  translationMixedScriptHitsLive: 0,
  translationMixedScriptHitsFinal: 0,
  preFirstTranslationDispatch: {
    wsMessages: 0,
    multiEffSpeakerMsgs: 0,
    multiLangTagMsgs: 0,
    nfFullReplaceMsgs: 0,
    joinedShrinkMsgs: 0,
    langFlipMsgs: 0,
    liveBufferAbsDeltaSum: 0,
    liveBufferMaxAbsDelta: 0,
    rates: {
      multiEffSpkPerMsg: 0,
      multiLangTagPerMsg: 0,
      nfReplacePerMsg: 0,
      shrinkPerMsg: 0,
      langFlipPerMsg: 0,
      avgLiveBufAbsDelta: 0,
    },
  },
  translationUiBlankAfterFetchLive: 0,
  translationUiBlankAfterFetchFinal: 0,
  translationUiBlankAfterFetchSubstantialSourceLive: 0,
  translationUiBlankAfterFetchSubstantialSourceFinal: 0,
  translationFetchExceptions: 0,
  interpretation: {
    upstreamStressScore: 0,
    rates: {
      multiRawSpkPerMsg: 0,
      multiEffSpkPerMsg: 0,
      multiLangTagPerMsg: 0,
      nfReplacePerMsg: 0,
      langFlipPerMsg: 0,
      shrinkPerMsg: 0,
      microFinalPerFinal: 0,
      rawEffMismatchPerSpeechTok: 0,
      avgLiveBufAbsDelta: 0,
    },
    notes: [],
  },
  comparison: {
    liveVsFinal: {
      shareShortDispatches_0to5Words_live: 0,
      shareShortDispatches_0to5Words_final: 0,
      shareNoSentenceEnd_live: 0,
      shareNoSentenceEnd_final: 0,
      shareMixedScript_live: 0,
      shareMixedScript_final: 0,
    },
    evidenceLines: [],
  },
};

let sessionStartMs = 0;
let prevDetectedLang = "";
let prevLiveBufferLen = 0;
let prevJoinedHypothesis = "";
let firstApiBoundTranslationDispatched = false;

let preFt_wsMessages = 0;
let preFt_multiEffSpeakerMsgs = 0;
let preFt_multiLangTagMsgs = 0;
let preFt_nfFullReplaceMsgs = 0;
let preFt_joinedShrinkMsgs = 0;
let preFt_langFlipMsgs = 0;
let preFt_liveBufferAbsDeltaSum = 0;
let preFt_liveBufferMaxAbsDelta = 0;

function mergeCombinedDispatchHistogram(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.translationDispatchWordsHistogramLive)) {
    out[k] = (out[k] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(state.translationDispatchWordsHistogramFinal)) {
    out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

function attachWindowApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    __interpretSttPipeline?: {
      getReport: () => SttPipelineReport;
      reset: () => void;
      print: () => void;
      exportCsvHeader: () => string;
      exportCsvRow: () => string;
    };
  };
  w.__interpretSttPipeline = {
    getReport: () => buildReport(),
    reset: () => resetSttPipelineInstrumentationSession(),
    print: () => {
      // eslint-disable-next-line no-console
      console.info("[stt_pipeline_report]", JSON.stringify(buildReport(), null, 2));
    },
    exportCsvHeader: () =>
      [
        "profile",
        "wall_ms",
        "ws_msgs",
        "multiEffSpkPerMsg",
        "multiLangTagPerMsg",
        "nfReplacePerMsg",
        "shrinkPerMsg",
        "langFlipPerMsg",
        "liveBufferMaxAbsDelta",
        "upstream_stress_0_100",
        "live_share_short_0_5",
        "final_share_short_0_5",
        "live_share_no_sentence_end",
        "final_share_no_sentence_end",
        "trans_live_count",
        "trans_final_count",
        "hist_live_0_2",
        "hist_live_3_5",
        "hist_final_0_2",
        "hist_final_3_5",
        "blank_fetch_live",
        "blank_fetch_final",
        "fetch_exceptions",
        "pre_ft_ws_msgs",
        "pre_ft_multiEff_per_msg",
      ].join(","),
    exportCsvRow: () => exportComparisonCsvRow(),
  };
}

export function resetSttPipelineInstrumentationSession(): void {
  sessionStartMs = Date.now();
  prevDetectedLang = "";
  prevLiveBufferLen = 0;
  prevJoinedHypothesis = "";
  firstApiBoundTranslationDispatched = false;
  preFt_wsMessages = 0;
  preFt_multiEffSpeakerMsgs = 0;
  preFt_multiLangTagMsgs = 0;
  preFt_nfFullReplaceMsgs = 0;
  preFt_joinedShrinkMsgs = 0;
  preFt_langFlipMsgs = 0;
  preFt_liveBufferAbsDeltaSum = 0;
  preFt_liveBufferMaxAbsDelta = 0;

  state.enabled = sttPipelineInstrumentationEnabled();
  state.sessionProfile = readSttPipelineSessionProfile();
  state.sessionWallMs = 0;
  state.wsMessagesTotal = 0;
  state.wsMessagesMultiRawSpeaker = 0;
  state.wsMessagesMultiEffSpeaker = 0;
  state.wsMessagesMultiLangTag = 0;
  state.tokensRawEffSpeakerMismatch = 0;
  state.speechTokensTotal = 0;
  state.finalTokensTotal = 0;
  state.nfTokensTotal = 0;
  state.microFinalTokens = 0;
  state.nfFullHypothesisReplaces = 0;
  state.detectedLangChangesMsgToMsg = 0;
  state.liveBufferAbsDeltaSum = 0;
  state.liveBufferMaxAbsDelta = 0;
  state.joinedHypothesisShrinkEvents = 0;
  state.joinedHypothesisGrowEvents = 0;
  state.segmentClosesSpeakerChange = 0;
  state.segmentClosesSessionEnd = 0;
  state.translationDispatchesTotal = 0;
  state.translationDispatchesFinal = 0;
  state.translationDispatchesLive = 0;
  state.translationLiveDebounceSchedules = 0;
  state.translationDispatchWordsHistogram = {};
  state.translationDispatchWordsHistogramLive = emptyHist();
  state.translationDispatchWordsHistogramFinal = emptyHist();
  state.translationDispatchWordsHistogramDebounceSchedule = emptyHist();
  state.translationDispatchesWithoutSentenceEnd = 0;
  state.translationDispatchesWithoutSentenceEndLive = 0;
  state.translationDispatchesWithoutSentenceEndFinal = 0;
  state.translationMixedScriptHits = 0;
  state.translationMixedScriptHitsLive = 0;
  state.translationMixedScriptHitsFinal = 0;
  state.preFirstTranslationDispatch = {
    wsMessages: 0,
    multiEffSpeakerMsgs: 0,
    multiLangTagMsgs: 0,
    nfFullReplaceMsgs: 0,
    joinedShrinkMsgs: 0,
    langFlipMsgs: 0,
    liveBufferAbsDeltaSum: 0,
    liveBufferMaxAbsDelta: 0,
    rates: {
      multiEffSpkPerMsg: 0,
      multiLangTagPerMsg: 0,
      nfReplacePerMsg: 0,
      shrinkPerMsg: 0,
      langFlipPerMsg: 0,
      avgLiveBufAbsDelta: 0,
    },
  };
  state.translationUiBlankAfterFetchLive = 0;
  state.translationUiBlankAfterFetchFinal = 0;
  state.translationUiBlankAfterFetchSubstantialSourceLive = 0;
  state.translationUiBlankAfterFetchSubstantialSourceFinal = 0;
  state.translationFetchExceptions = 0;
  state.interpretation = {
    upstreamStressScore: 0,
    rates: {
      multiRawSpkPerMsg: 0,
      multiEffSpkPerMsg: 0,
      multiLangTagPerMsg: 0,
      nfReplacePerMsg: 0,
      langFlipPerMsg: 0,
      shrinkPerMsg: 0,
      microFinalPerFinal: 0,
      rawEffMismatchPerSpeechTok: 0,
      avgLiveBufAbsDelta: 0,
    },
    notes: [],
  };
  state.comparison = {
    liveVsFinal: {
      shareShortDispatches_0to5Words_live: 0,
      shareShortDispatches_0to5Words_final: 0,
      shareNoSentenceEnd_live: 0,
      shareNoSentenceEnd_final: 0,
      shareMixedScript_live: 0,
      shareMixedScript_final: 0,
    },
    evidenceLines: [],
  };
  if (state.enabled) attachWindowApi();
}

/** WS frame analysis — call once per Soniox message after `effSpk` is computed. */
export function recordSttWsFrame(params: {
  tokens: SttPipelineSonioxToken[];
  effSpk: (string | undefined)[];
  joinedHypothesisFromTokens: string;
  detectedLangNow: string;
  liveBufferLen: number;
  nfFullReplace: boolean;
}): void {
  const diag = sttPipelineInstrumentationEnabled();
  const trace = liveBlankTraceEnabled();
  if (!diag && !trace) return;

  const {
    tokens,
    effSpk,
    joinedHypothesisFromTokens,
    detectedLangNow,
    liveBufferLen,
    nfFullReplace,
  } = params;

  if (diag) state.wsMessagesTotal += 1;

  const rawSpeakers = new Set<string>();
  const langs = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (isEndpointToken(t)) continue;

    const rawOnTok =
      t.speaker !== undefined && t.speaker !== null ? String(t.speaker) : undefined;
    const eff = effSpk[i];
    if (diag) {
      if (rawOnTok !== undefined && eff !== undefined && rawOnTok !== String(eff)) {
        state.tokensRawEffSpeakerMismatch += 1;
      }
      state.speechTokensTotal += 1;
      if (t.is_final) {
        state.finalTokensTotal += 1;
        const vis = t.text.replace(/\s+/g, "").length;
        if (vis > 0 && vis <= 2) state.microFinalTokens += 1;
      } else {
        state.nfTokensTotal += 1;
      }
    }

    if (rawOnTok !== undefined) rawSpeakers.add(rawOnTok);
    if (t.language && String(t.language).trim()) langs.add(String(t.language).trim());
  }

  const effSet = new Set<string>();
  for (const e of effSpk) {
    if (e !== undefined && e !== null && String(e).trim() !== "") effSet.add(String(e));
  }

  const multiEff = effSet.size >= 2;
  const multiLang = langs.size >= 2;
  if (diag) {
    if (rawSpeakers.size >= 2) state.wsMessagesMultiRawSpeaker += 1;
    if (multiEff) state.wsMessagesMultiEffSpeaker += 1;
    if (multiLang) state.wsMessagesMultiLangTag += 1;

    if (nfFullReplace) state.nfFullHypothesisReplaces += 1;
  }

  let langFlip = false;
  if (prevDetectedLang && detectedLangNow && prevDetectedLang !== detectedLangNow) {
    if (diag) state.detectedLangChangesMsgToMsg += 1;
    langFlip = true;
  }
  prevDetectedLang = detectedLangNow;

  const dBuf = Math.abs(liveBufferLen - prevLiveBufferLen);
  if (diag) {
    state.liveBufferAbsDeltaSum += dBuf;
    if (dBuf > state.liveBufferMaxAbsDelta) state.liveBufferMaxAbsDelta = dBuf;
  }
  prevLiveBufferLen = liveBufferLen;

  const j = joinedHypothesisFromTokens;
  let shrink = false;
  if (prevJoinedHypothesis.length > 0 && j.length < prevJoinedHypothesis.length) {
    if (diag) state.joinedHypothesisShrinkEvents += 1;
    shrink = true;
  } else if (diag && j.length > prevJoinedHypothesis.length) {
    state.joinedHypothesisGrowEvents += 1;
  }
  prevJoinedHypothesis = j;

  if (diag && !firstApiBoundTranslationDispatched) {
    preFt_wsMessages += 1;
    if (multiEff) preFt_multiEffSpeakerMsgs += 1;
    if (multiLang) preFt_multiLangTagMsgs += 1;
    if (nfFullReplace) preFt_nfFullReplaceMsgs += 1;
    if (shrink) preFt_joinedShrinkMsgs += 1;
    if (langFlip) preFt_langFlipMsgs += 1;
    preFt_liveBufferAbsDeltaSum += dBuf;
    if (dBuf > preFt_liveBufferMaxAbsDelta) preFt_liveBufferMaxAbsDelta = dBuf;
  }

  if (trace) {
    liveBlankTraceOnWsFrame({
      multiEffSpeakerFrame: multiEff,
      multiLangTagFrame: multiLang,
      nfFullReplace,
      hypothesisShrink: shrink,
      langFlipThisMsg: langFlip,
      liveBufferLen,
      joinedHypothesisLen: joinedHypothesisFromTokens.length,
    });
  }
}

export function recordSttSegmentClose(kind: "speaker_change" | "session_end"): void {
  if (!sttPipelineInstrumentationEnabled()) return;
  if (kind === "speaker_change") state.segmentClosesSpeakerChange += 1;
  else state.segmentClosesSessionEnd += 1;
}

/** Counts a live translation arm-debounce path (payload may differ when debounce fires). */
export function recordTranslationLiveDebounceSchedule(sourceText: string): void {
  if (!sttPipelineInstrumentationEnabled()) return;
  state.translationLiveDebounceSchedules += 1;
  const t = sourceText.trim();
  const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
  bump(state.translationDispatchWordsHistogramDebounceSchedule, bucketWords(words));
}

/** Call when dispatchTranslation continues past debounce — correlates with chunks that feed fetchTranslation. */
export function recordTranslationDispatch(params: {
  sourceText: string;
  isFinal: boolean;
}): void {
  if (!sttPipelineInstrumentationEnabled()) return;
  firstApiBoundTranslationDispatched = true;

  const t = params.sourceText.trim();
  const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
  const b = bucketWords(words);
  state.translationDispatchesTotal += 1;
  if (params.isFinal) {
    state.translationDispatchesFinal += 1;
    bump(state.translationDispatchWordsHistogramFinal, b);
  } else {
    state.translationDispatchesLive += 1;
    bump(state.translationDispatchWordsHistogramLive, b);
  }
  state.translationDispatchWordsHistogram = mergeCombinedDispatchHistogram();

  const noSent = !!(t && !/[.!?؟،。！？]\s*$/u.test(t));
  if (noSent) {
    state.translationDispatchesWithoutSentenceEnd += 1;
    if (params.isFinal) state.translationDispatchesWithoutSentenceEndFinal += 1;
    else state.translationDispatchesWithoutSentenceEndLive += 1;
  }

  const sc = scriptLetterCounts(t);
  const buckets =
    (sc.latin > 5 ? 1 : 0) +
    (sc.cyrillic > 5 ? 1 : 0) +
    (sc.arabic > 5 ? 1 : 0) +
    (sc.cjk > 5 ? 1 : 0) +
    (sc.otherLetter > 8 ? 1 : 0);
  if (buckets >= 2) {
    state.translationMixedScriptHits += 1;
    if (params.isFinal) state.translationMixedScriptHitsFinal += 1;
    else state.translationMixedScriptHitsLive += 1;
  }
}

/** Blank translation cell after fetch retries (supports hypothesis D vs upstream). */
export function recordTranslationUiBlankAfterFetch(params: {
  lane: "live" | "final";
  sourceChars: number;
}): void {
  if (!sttPipelineInstrumentationEnabled()) return;
  const sub = params.sourceChars >= 20;
  if (params.lane === "final") {
    state.translationUiBlankAfterFetchFinal += 1;
    if (sub) state.translationUiBlankAfterFetchSubstantialSourceFinal += 1;
  } else {
    state.translationUiBlankAfterFetchLive += 1;
    if (sub) state.translationUiBlankAfterFetchSubstantialSourceLive += 1;
  }
}

export function recordTranslationFetchException(): void {
  if (!sttPipelineInstrumentationEnabled()) return;
  state.translationFetchExceptions += 1;
}

function buildEvidenceLines(r: SttPipelineReport): string[] {
  const L = r.comparison.liveVsFinal;
  const ev: string[] = [];
  const u = r.interpretation.rates;

  if (L.shareShortDispatches_0to5Words_live > L.shareShortDispatches_0to5Words_final + 0.12) {
    ev.push(
      "Live API-bound dispatches are markedly shorter than finals (0–5 word share) — incremental STT sends fragmented previews (supports A/B for LIVE path).",
    );
  }
  if (L.shareNoSentenceEnd_final > 0.55 && u.nfReplacePerMsg > 0.08) {
    ev.push(
      "Many finals still lack sentence-ending punctuation while NF replacement churn is high — STT may be finalizing mid-clause (upstream / segmentation).",
    );
  }
  if (u.multiEffSpkPerMsg > 0.12 || u.multiLangTagPerMsg > 0.1) {
    ev.push(
      "Frequent multi-speaker or multi-language-token frames — overlapping speech / diarization-LID instability likely stressing segment assembly (supports C).",
    );
  }
  if (
    r.translationUiBlankAfterFetchSubstantialSourceFinal > 0 &&
    r.translationUiBlankAfterFetchSubstantialSourceFinal < r.translationDispatchesFinal * 0.05
  ) {
    ev.push(
      "Few blank finals with substantial source — empty UI more likely live/aborted paths than systematic translation refusal (partial support for D leaning upstream/live volatility).",
    );
  }
  if (r.preFirstTranslationDispatch.wsMessages > 10 && r.preFirstTranslationDispatch.rates.multiEffSpkPerMsg > 0.08) {
    ev.push(
      "Elevated multi-speaker frames BEFORE any translation dispatch — corruption pattern begins upstream of MT (supports #2 upstream hypothesis).",
    );
  }
  if (
    L.shareMixedScript_final > 0.15 &&
    u.multiLangTagPerMsg < 0.05
  ) {
    ev.push(
      "Mixed-script finals with calm language tags — worth checking translation echo vs genuine bilingual spans (may lean toward #2 translation-layer follow-up after upstream ruled out).",
    );
  }
  if (ev.length === 0) {
    ev.push(
      "No strong automated verdict — compare `quiet` vs `noisy` CSV rows side-by-side; thresholds above are conservative heuristics only.",
    );
  }
  return ev;
}

function exportComparisonCsvRow(): string {
  const r = buildReport();
  const liveHist = r.translationDispatchWordsHistogramLive;
  const finHist = r.translationDispatchWordsHistogramFinal;
  const pf = r.preFirstTranslationDispatch;
  const nPf = Math.max(1, pf.wsMessages);
  const pfEff = pf.multiEffSpeakerMsgs / nPf;

  const esc = (s: string | number) => String(s);

  return [
    esc(r.sessionProfile),
    esc(Math.round(r.sessionWallMs)),
    esc(r.wsMessagesTotal),
    esc(r.interpretation.rates.multiEffSpkPerMsg.toFixed(6)),
    esc(r.interpretation.rates.multiLangTagPerMsg.toFixed(6)),
    esc(r.interpretation.rates.nfReplacePerMsg.toFixed(6)),
    esc(r.interpretation.rates.shrinkPerMsg.toFixed(6)),
    esc(r.interpretation.rates.langFlipPerMsg.toFixed(6)),
    esc(r.liveBufferMaxAbsDelta),
    esc(r.interpretation.upstreamStressScore),
    esc(r.comparison.liveVsFinal.shareShortDispatches_0to5Words_live.toFixed(6)),
    esc(r.comparison.liveVsFinal.shareShortDispatches_0to5Words_final.toFixed(6)),
    esc(r.comparison.liveVsFinal.shareNoSentenceEnd_live.toFixed(6)),
    esc(r.comparison.liveVsFinal.shareNoSentenceEnd_final.toFixed(6)),
    esc(r.translationDispatchesLive),
    esc(r.translationDispatchesFinal),
    esc(liveHist["0-2"] ?? 0),
    esc(liveHist["3-5"] ?? 0),
    esc(finHist["0-2"] ?? 0),
    esc(finHist["3-5"] ?? 0),
    esc(r.translationUiBlankAfterFetchLive),
    esc(r.translationUiBlankAfterFetchFinal),
    esc(r.translationFetchExceptions),
    esc(pf.wsMessages),
    esc(pfEff.toFixed(6)),
  ].join(",");
}

function buildReport(): SttPipelineReport {
  const wall = sessionStartMs > 0 ? Math.max(1, Date.now() - sessionStartMs) : 1;
  state.sessionWallMs = wall;
  state.enabled = sttPipelineInstrumentationEnabled();
  state.sessionProfile = readSttPipelineSessionProfile();

  const n = Math.max(1, state.wsMessagesTotal);
  const rates = {
    multiRawSpkPerMsg: state.wsMessagesMultiRawSpeaker / n,
    multiEffSpkPerMsg: state.wsMessagesMultiEffSpeaker / n,
    multiLangTagPerMsg: state.wsMessagesMultiLangTag / n,
    nfReplacePerMsg: state.nfFullHypothesisReplaces / n,
    langFlipPerMsg: state.detectedLangChangesMsgToMsg / n,
    shrinkPerMsg: state.joinedHypothesisShrinkEvents / n,
    microFinalPerFinal: state.finalTokensTotal > 0 ? state.microFinalTokens / state.finalTokensTotal : 0,
    rawEffMismatchPerSpeechTok:
      state.speechTokensTotal > 0 ? state.tokensRawEffSpeakerMismatch / state.speechTokensTotal : 0,
    avgLiveBufAbsDelta: state.liveBufferAbsDeltaSum / n,
  };

  const stress =
    100 *
    (0.28 * Math.min(1, rates.multiEffSpkPerMsg * 4) +
      0.22 * Math.min(1, rates.multiLangTagPerMsg * 5) +
      0.22 * Math.min(1, rates.nfReplacePerMsg * 3) +
      0.14 * Math.min(1, rates.langFlipPerMsg * 8) +
      0.14 * Math.min(1, rates.shrinkPerMsg * 5));

  const nPf = Math.max(1, preFt_wsMessages);
  state.preFirstTranslationDispatch = {
    wsMessages: preFt_wsMessages,
    multiEffSpeakerMsgs: preFt_multiEffSpeakerMsgs,
    multiLangTagMsgs: preFt_multiLangTagMsgs,
    nfFullReplaceMsgs: preFt_nfFullReplaceMsgs,
    joinedShrinkMsgs: preFt_joinedShrinkMsgs,
    langFlipMsgs: preFt_langFlipMsgs,
    liveBufferAbsDeltaSum: preFt_liveBufferAbsDeltaSum,
    liveBufferMaxAbsDelta: preFt_liveBufferMaxAbsDelta,
    rates: {
      multiEffSpkPerMsg: preFt_multiEffSpeakerMsgs / nPf,
      multiLangTagPerMsg: preFt_multiLangTagMsgs / nPf,
      nfReplacePerMsg: preFt_nfFullReplaceMsgs / nPf,
      shrinkPerMsg: preFt_joinedShrinkMsgs / nPf,
      langFlipPerMsg: preFt_langFlipMsgs / nPf,
      avgLiveBufAbsDelta: preFt_liveBufferAbsDeltaSum / nPf,
    },
  };

  const liveTot = Math.max(1, state.translationDispatchesLive);
  const finTot = Math.max(1, state.translationDispatchesFinal);

  state.comparison.liveVsFinal = {
    shareShortDispatches_0to5Words_live: histShortDispatchShare(state.translationDispatchWordsHistogramLive),
    shareShortDispatches_0to5Words_final: histShortDispatchShare(state.translationDispatchWordsHistogramFinal),
    shareNoSentenceEnd_live: state.translationDispatchesWithoutSentenceEndLive / liveTot,
    shareNoSentenceEnd_final: state.translationDispatchesWithoutSentenceEndFinal / finTot,
    shareMixedScript_live: state.translationMixedScriptHitsLive / liveTot,
    shareMixedScript_final: state.translationMixedScriptHitsFinal / finTot,
  };

  state.translationDispatchWordsHistogram = mergeCombinedDispatchHistogram();

  const notes: string[] = [
    "Set profile: localStorage interpreterai_stt_pipeline_profile = quiet | noisy for spreadsheet comparison.",
    "Rates are per Soniox websocket message — NOT per wall-clock second.",
    "multiEffSpeaker/multiLangTag spike ⇒ overlapping speakers or unstable LID inside single frames (noisy-room proxy).",
    "nfFullHypothesisReplaces / nfReplacePerMsg ⇒ non-monotonic NF revisions (partial churn proxy).",
    "joinedHypothesisShrinkEvents / shrinkPerMsg ⇒ Soniox shortened full-frame hypothesis.",
    "preFirstTranslationDispatch captures upstream turbulence BEFORE the first API-bound translate dispatch.",
    "comparison.liveVsFinal contrasts LIVE vs FINAL dispatch shaping (answers whether LIVE stays chaotic while finals stabilize).",
    "translationUiBlankAfterFetch* counts empty outcomes after the fetch path (daily-limit exits excluded earlier).",
    "CSV: window.__interpretSttPipeline.exportCsvHeader() + exportCsvRow() — paste two sessions under one header.",
    "Thresholds in comparison.evidenceLines are heuristic — paired quiet/noisy runs are the real evidence.",
  ];

  state.interpretation = {
    upstreamStressScore: Math.round(stress * 10) / 10,
    rates,
    notes,
  };

  const built: SttPipelineReport = { ...state, interpretation: state.interpretation };
  built.comparison = {
    ...built.comparison,
    evidenceLines: buildEvidenceLines(built),
  };
  return built;
}

/** Structured console line for `stop()` alongside translation_diagnostic_summary. */
export function logSttPipelineReportConsole(): void {
  if (!sttPipelineInstrumentationEnabled()) return;
  const r = buildReport();
  const lv = r.comparison.liveVsFinal;
  const pf = r.preFirstTranslationDispatch.rates;
  // eslint-disable-next-line no-console
  console.info(
    "[stt_pipeline_summary]",
    `profile=${r.sessionProfile}`,
    `wall_ms=${r.sessionWallMs}`,
    `ws_msgs=${r.wsMessagesTotal}`,
    `rates_multiEffSpkPerMsg=${r.interpretation.rates.multiEffSpkPerMsg.toFixed(4)}`,
    `rates_multiLangTagPerMsg=${r.interpretation.rates.multiLangTagPerMsg.toFixed(4)}`,
    `rates_nfReplacePerMsg=${r.interpretation.rates.nfReplacePerMsg.toFixed(4)}`,
    `rates_shrinkPerMsg=${r.interpretation.rates.shrinkPerMsg.toFixed(4)}`,
    `rates_langFlipPerMsg=${r.interpretation.rates.langFlipPerMsg.toFixed(4)}`,
    `liveBufferMaxAbsDelta=${r.liveBufferMaxAbsDelta}`,
    `upstream_stress_0_100=${r.interpretation.upstreamStressScore}`,
    `hist_live=${JSON.stringify(r.translationDispatchWordsHistogramLive)}`,
    `hist_final=${JSON.stringify(r.translationDispatchWordsHistogramFinal)}`,
    `trans_no_sentence_end_total=${r.translationDispatchesWithoutSentenceEnd}`,
    `trans_no_sentence_end_live=${r.translationDispatchesWithoutSentenceEndLive}`,
    `trans_no_sentence_end_final=${r.translationDispatchesWithoutSentenceEndFinal}`,
    `live_share_short_0_5=${lv.shareShortDispatches_0to5Words_live.toFixed(4)}`,
    `final_share_short_0_5=${lv.shareShortDispatches_0to5Words_final.toFixed(4)}`,
    `live_share_no_sentence_end=${lv.shareNoSentenceEnd_live.toFixed(4)}`,
    `final_share_no_sentence_end=${lv.shareNoSentenceEnd_final.toFixed(4)}`,
    `pre_ft_ws_msgs=${r.preFirstTranslationDispatch.wsMessages}`,
    `pre_ft_multiEff_per_msg=${pf.multiEffSpkPerMsg.toFixed(4)}`,
    `blank_fetch_live=${r.translationUiBlankAfterFetchLive}`,
    `blank_fetch_final=${r.translationUiBlankAfterFetchFinal}`,
    `fetch_exceptions=${r.translationFetchExceptions}`,
  );
}
