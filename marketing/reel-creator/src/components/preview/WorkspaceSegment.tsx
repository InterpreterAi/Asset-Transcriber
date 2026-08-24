/**
 * Live InterpreterAI workspace — pixel match to admin-marketing-demo / user reference.
 * Frame, logo, sizes, and chrome are fixed; only transcript dialogue is dynamic.
 */

import { forwardRef, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import {
  BookOpen,
  ChevronDown,
  NotebookPen,
  Rows3,
  Square,
  Sun,
  Zap,
} from "lucide-react";
import { reelLanguageLabel, isRtlLanguage } from "@/lib/constants/languages";
import type { LanguagePair } from "@/lib/languageFlags";
import {
  originalTextAtVoTime,
  translationPhrasesAfterOriginal,
  type TranslationReveal,
} from "@/lib/workspaceVoSync";
import type { TimedWord } from "@/lib/kineticCaptions";
import {
  exchangeStripeSpeaker,
  translationAfterOriginalProgress,
  typedText,
  TYPING_SPEED,
  WORKSPACE_SPEAKER_COLORS,
  type WorkspaceConversation,
  type WorkspaceExchange,
} from "@/lib/workspaceModel";

/** Reference phone width — admin-marketing-demo frame; scaled to 1080 reel canvas. */
const REF_W = 390;
const S = 1080 / REF_W;

const px = (n: number) => Math.round(n * S);

const CYAN = "#67E8F9";
const CYAN_TILE = "rgba(34, 211, 238, 0.15)";
const LIVE_RED = "#DC2626";
const BG = "#02050b";
const HEADER_BG = "rgba(11, 18, 32, 0.92)";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_SOFT = "rgba(255,255,255,0.06)";
const MUTED = "rgba(148,163,184,0.72)";
const TEXT = "rgb(241, 245, 249)";
const TRANS_ROOT_BG = "rgba(11, 17, 29, 0.92)";
const STRIPE_A = WORKSPACE_SPEAKER_COLORS.A;
const STRIPE_B = WORKSPACE_SPEAKER_COLORS.B;
const STRIPE_C = WORKSPACE_SPEAKER_COLORS.C;
const FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type VoScheduleItem = {
  startSec: number;
  durationSec: number;
  speechDurSec?: number;
  exchangeIndex: number;
};

type Props = {
  conversation: WorkspaceConversation;
  languagePair: LanguagePair;
  segmentProgress: number;
  durationSec?: number;
  playheadSec?: number;
  voSchedule?: VoScheduleItem[];
  /** Word timestamps per exchange — synced to decoded audio when present. */
  wordsByExchange?: TimedWord[][];
  subtitleScale?: number;
  voSyncedTyping?: boolean;
  /** Live preview — ease transcript scroll; export uses instant snap. */
  smoothTranscriptScroll?: boolean;
};

function pairCodeLabel(sourceLang: string, targetLang: string): string {
  const code = (l: string) => (l.split("-")[0] ?? l).toUpperCase();
  return `${code(sourceLang)} → ${code(targetLang)}`;
}

function exchangeProgressFromVo(
  playheadSec: number,
  schedule: VoScheduleItem[],
  exIdx: number,
): number {
  const item = schedule.find((s) => s.exchangeIndex === exIdx);
  if (!item || item.durationSec <= 0) return 0;
  if (playheadSec < item.startSec) return 0;
  if (playheadSec >= item.startSec + item.durationSec) return 1;
  return (playheadSec - item.startSec) / item.durationSec;
}

function fmtTimer(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function exchangeProgress(p: number, ex: WorkspaceExchange): number {
  if (p <= ex.startFrac) return 0;
  if (p >= ex.endFrac) return 1;
  return (p - ex.startFrac) / (ex.endFrac - ex.startFrac);
}

function stripeColor(speaker: "A" | "B" | "C"): string {
  if (speaker === "C") return STRIPE_C;
  return speaker === "A" ? STRIPE_A : STRIPE_B;
}

export function WorkspaceSegment({
  conversation,
  segmentProgress,
  durationSec = 15,
  playheadSec,
  voSchedule,
  wordsByExchange,
  subtitleScale = 1,
  voSyncedTyping = false,
  smoothTranscriptScroll = false,
}: Props) {
  const useVoSync = playheadSec !== undefined && (voSchedule?.length ?? 0) > 0;
  const typingSpeed = voSyncedTyping || useVoSync ? 1 : TYPING_SPEED;
  const elapsed = useVoSync ? playheadSec! : Math.min(1, Math.max(0, segmentProgress)) * durationSec;
  const p = useVoSync ? Math.min(1, playheadSec! / durationSec) : Math.min(1, Math.max(0, segmentProgress));

  const exProgress = (exIdx: number, ex: WorkspaceExchange) =>
    useVoSync
      ? exchangeProgressFromVo(playheadSec!, voSchedule!, exIdx)
      : exchangeProgress(p, ex);

  const localClipSec = (exIdx: number): number => {
    if (!useVoSync) return 0;
    const item = voSchedule!.find((s) => s.exchangeIndex === exIdx);
    if (!item) return 0;
    return Math.max(0, Math.min(item.durationSec, playheadSec! - item.startSec));
  };

  /** Time into the spoken VO only — captions track this, not the translation hold. */
  const localSpeechSec = (exIdx: number): number => {
    if (!useVoSync) return 0;
    const item = voSchedule!.find((s) => s.exchangeIndex === exIdx);
    if (!item) return 0;
    const speechDur = item.speechDurSec ?? item.durationSec;
    return Math.max(0, Math.min(speechDur, playheadSec! - item.startSec));
  };

  const speechDurSec = (exIdx: number): number => {
    const item = voSchedule!.find((s) => s.exchangeIndex === exIdx);
    return item?.speechDurSec ?? item?.durationSec ?? 2;
  };


  const originalForExchange = (exIdx: number, ex: WorkspaceExchange, _progress: number) => {
    const words = wordsByExchange?.[exIdx];
    if (words && words.length > 0 && useVoSync) {
      return originalTextAtVoTime(
        words,
        localSpeechSec(exIdx),
        ex.original,
        speechDurSec(exIdx),
      );
    }
    return typedText(ex.original, exProgress(exIdx, ex), typingSpeed);
  };

  const translationForExchange = (
    exIdx: number,
    ex: WorkspaceExchange,
    progress: number,
  ): TranslationReveal => {
    const words = wordsByExchange?.[exIdx];
    if (words && words.length > 0 && useVoSync) {
      return translationPhrasesAfterOriginal(
        words,
        localSpeechSec(exIdx),
        speechDurSec(exIdx),
        ex.original,
        ex.translation,
      );
    }
    return translationAfterOriginalProgress(ex.translation, progress, 0.72);
  };

  const originalDone = (exIdx: number): boolean => {
    const words = wordsByExchange?.[exIdx];
    if (words && words.length > 0 && useVoSync) {
      return localSpeechSec(exIdx) >= speechDurSec(exIdx) - 0.02;
    }
    return exProgress(exIdx, conversation.exchanges[exIdx]!) >= 0.98;
  };

  const activeIdx = useVoSync
    ? (() => {
        const t = playheadSec!;
        // Prefer spoken VO window, then visual hold — always use exchangeIndex (not schedule slot).
        const speechHit = voSchedule!.find((s) => {
          const speech = s.speechDurSec ?? s.durationSec;
          return t >= s.startSec && t < s.startSec + speech;
        });
        if (speechHit) return speechHit.exchangeIndex;
        const visualHit = voSchedule!.find(
          (s) => t >= s.startSec && t < s.startSec + s.durationSec,
        );
        return visualHit ? visualHit.exchangeIndex : -1;
      })()
    : conversation.exchanges.findIndex((ex) => p >= ex.startFrac && p < ex.endFrac);

  const settled = conversation.exchanges.filter((ex, i) => {
    if (useVoSync) {
      const item = voSchedule!.find((s) => s.exchangeIndex === i);
      return item ? playheadSec! >= item.startSec + item.durationSec : false;
    }
    return p >= ex.endFrac;
  });

  const fontPx = Math.round(px(12) * subtitleScale);
  const lineHeight = 1.45;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef(0);
  const scrollAnimRef = useRef<number | undefined>(undefined);

  const activeEx = activeIdx >= 0 ? conversation.exchanges[activeIdx] : null;
  const activeOriginalLen = activeEx
    ? originalForExchange(activeIdx, activeEx, exProgress(activeIdx, activeEx)).length
    : 0;
  const activeTranslationLen =
    activeEx && activeIdx >= 0
      ? translationForExchange(activeIdx, activeEx, exProgress(activeIdx, activeEx)).text.length
      : 0;

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const padding = Math.round(fontPx * 1.1);
    const viewport = container.clientHeight;
    const maxScroll = Math.max(0, container.scrollHeight - viewport);
    let target = 0;

    const anchor = activeRowRef.current;
    if (anchor) {
      const anchorBottom = anchor.offsetTop + anchor.offsetHeight;
      target = Math.max(0, anchorBottom - viewport + padding);
    } else if (settled.length > 0) {
      target = maxScroll;
    }

    scrollTargetRef.current = Math.min(maxScroll, target);

    if (!smoothTranscriptScroll) {
      container.scrollTop = scrollTargetRef.current;
      return;
    }

    if (scrollAnimRef.current) return;

    const tick = () => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const goal = scrollTargetRef.current;
      const delta = goal - el.scrollTop;
      if (Math.abs(delta) < 0.75) {
        el.scrollTop = goal;
        scrollAnimRef.current = undefined;
        return;
      }
      el.scrollTop += delta * 0.18;
      scrollAnimRef.current = requestAnimationFrame(tick);
    };

    scrollAnimRef.current = requestAnimationFrame(tick);
    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = undefined;
    };
  }, [
    activeIdx,
    activeOriginalLen,
    activeTranslationLen,
    settled.length,
    fontPx,
    playheadSec,
    segmentProgress,
    conversation.exchanges.length,
    smoothTranscriptScroll,
  ]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: BG,
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        color: TEXT,
        overflow: "hidden",
      }}
    >
      {/* Header — brand + pair + LIVE */}
      <header
        style={{
          height: px(44),
          flexShrink: 0,
          borderBottom: `1px solid ${BORDER}`,
          background: HEADER_BG,
          padding: `0 ${px(12)}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: px(8),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: px(8), minWidth: 0 }}>
          <div
            style={{
              width: px(28),
              height: px(28),
              borderRadius: px(8),
              background: CYAN_TILE,
              color: CYAN,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Zap size={px(14)} strokeWidth={2.2} />
          </div>
          <span
            style={{
              fontSize: px(13),
              fontWeight: 600,
              color: "#FFFFFF",
              whiteSpace: "nowrap",
            }}
          >
            Interpreter<span style={{ color: CYAN }}>AI</span>
          </span>
          <span
            style={{
              fontSize: px(10),
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              padding: `${px(2)}px ${px(6)}px`,
              borderRadius: px(6),
              border: `1px solid rgba(255,255,255,0.1)`,
              background: "rgba(255,255,255,0.03)",
              color: "rgba(148,163,184,0.9)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {pairCodeLabel(conversation.sourceLang, conversation.targetLang)}
          </span>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: px(8),
            padding: `${px(2)}px ${px(8)}px`,
            borderRadius: 999,
            background: LIVE_RED,
            color: "#FFFFFF",
            border: "1px solid #EF4444",
            boxShadow: "0 0 0 1px rgba(220,38,38,0.35)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: px(6),
              height: px(6),
              borderRadius: "50%",
              background: "#FFFFFF",
            }}
          />
          <span
            style={{
              fontSize: px(10),
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}
          >
            LIVE
          </span>
          <span
            style={{
              fontSize: px(10),
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              opacity: 0.95,
            }}
          >
            {fmtTimer(elapsed)}
          </span>
        </div>
      </header>

      {/* Toolbar */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: `1px solid ${BORDER_SOFT}`,
          background: "rgba(255,255,255,0.015)",
          padding: `${px(6)}px ${px(8)}px`,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: px(6),
        }}
      >
        <FontSizeStepper />
        <ToolbarChip>{`0m / 2h · 7 days left`}</ToolbarChip>
        <ToolbarChip icon={<NotebookPen size={px(12)} strokeWidth={2} />}>Notes</ToolbarChip>
        <ToolbarChip icon={<BookOpen size={px(12)} strokeWidth={2} />}>Glossary</ToolbarChip>
        <span
          style={{
            marginLeft: "auto",
            color: "rgba(251, 191, 36, 0.9)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Sun size={px(14)} strokeWidth={2} />
        </span>
      </div>

      {/* Column headers */}
      <div
        style={{
          height: px(28),
          flexShrink: 0,
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
          background: "rgba(255,255,255,0.02)",
          padding: `0 ${px(12)}px`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: px(12),
          alignItems: "center",
        }}
      >
        {["Original", "Translation"].map((h) => (
          <span
            key={h}
            style={{
              fontSize: px(10),
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(100,116,139,0.95)",
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Transcript root */}
      <main
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          padding: `${px(8)}px ${px(10)}px`,
        }}
      >
        <div
          ref={scrollContainerRef}
          style={{
            height: "100%",
            borderRadius: px(12),
            border: `1px solid ${BORDER}`,
            background: TRANS_ROOT_BG,
            overflow: "hidden",
            padding: `${px(10)}px ${px(8)}px`,
            overflowY: "auto",
            scrollBehavior: "auto",
          }}
        >
          {settled.map((ex) => {
            const i = conversation.exchanges.findIndex((e) => e.id === ex.id);
            return (
              <ExchangeRow
                key={ex.id}
                ex={ex}
                original={ex.original}
                translation={ex.translation}
                active={false}
                fontPx={fontPx}
                lineHeight={lineHeight}
              />
            );
          })}
          {activeIdx >= 0 ? (() => {
            const activeEx = conversation.exchanges[activeIdx]!;
            const activeProgress = exProgress(activeIdx, activeEx);
            const trans = translationForExchange(activeIdx, activeEx, activeProgress);
            return (
            <ExchangeRow
              ref={activeRowRef}
              ex={activeEx}
              original={originalForExchange(
                activeIdx,
                activeEx,
                activeProgress,
              )}
              translation={trans.text}
              translationOpacity={trans.opacity}
              active
              typing={!originalDone(activeIdx)}
              fontPx={fontPx}
              lineHeight={lineHeight}
            />
            );
          })() : null}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${BORDER}`,
          background: HEADER_BG,
          padding: `${px(10)}px ${px(12)}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: px(6),
            marginBottom: px(8),
          }}
        >
          <LangDropdown label={reelLanguageLabel(conversation.sourceLang)} />
          <span style={{ fontSize: px(10), fontWeight: 600, color: "rgba(100,116,139,0.9)", flexShrink: 0 }}>
            ↔
          </span>
          <LangDropdown label={reelLanguageLabel(conversation.targetLang)} />
          <button
            type="button"
            aria-hidden
            style={{
              marginLeft: "auto",
              height: px(32),
              padding: `0 ${px(8)}px`,
              borderRadius: px(8),
              border: `1px solid rgba(255,255,255,0.1)`,
              background: "#121a2a",
              color: MUTED,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Rows3 size={px(14)} strokeWidth={2} />
          </button>
        </div>
        <div
          style={{
            width: "100%",
            height: px(40),
            borderRadius: 999,
            background: "#EF4444",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: px(14),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: px(8),
            boxShadow: "0 0 30px rgba(239,68,68,0.45)",
          }}
        >
          <Square size={px(14)} fill="#FFFFFF" strokeWidth={0} />
          Stop
        </div>
      </footer>
    </div>
  );
}

function FontSizeStepper() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: px(24),
        borderRadius: px(6),
        border: `1px solid rgba(255,255,255,0.1)`,
        background: "rgba(255,255,255,0.04)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <span style={{ padding: `0 ${px(6)}px`, fontSize: px(12), fontWeight: 600, color: MUTED }}>−</span>
      <span
        style={{
          padding: `0 ${px(4)}px`,
          fontSize: px(10),
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          minWidth: px(22),
          textAlign: "center",
          color: TEXT,
        }}
      >
        12
      </span>
      <span style={{ padding: `0 ${px(6)}px`, fontSize: px(12), fontWeight: 600, color: MUTED }}>+</span>
    </div>
  );
}

function ToolbarChip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: px(4),
        height: px(24),
        padding: `0 ${px(6)}px`,
        borderRadius: px(6),
        background: "rgba(255,255,255,0.04)",
        border: `1px solid rgba(255,255,255,0.08)`,
        fontSize: px(10),
        fontWeight: 500,
        color: "rgba(203,213,225,0.9)",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function LangDropdown({ label }: { label: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: px(32),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${px(8)}px`,
        borderRadius: px(8),
        background: "#121a2a",
        border: `1px solid rgba(255,255,255,0.1)`,
        fontSize: px(12),
        fontWeight: 400,
        color: TEXT,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <ChevronDown size={px(14)} color={MUTED} strokeWidth={2} />
    </div>
  );
}

const ExchangeRow = forwardRef(function ExchangeRow(
  {
    ex,
    original,
    translation,
    active,
    typing,
    translationOpacity = 1,
    fontPx,
    lineHeight,
  }: {
    ex: WorkspaceExchange;
    original: string;
    translation: string;
    active: boolean;
    typing?: boolean;
    translationOpacity?: number;
    fontPx: number;
    lineHeight: number;
  },
  ref: Ref<HTMLDivElement>,
) {
  const textStyle: CSSProperties = {
    fontSize: fontPx,
    lineHeight,
    fontWeight: 500,
    color: TEXT,
    margin: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  };
  const transStyle: CSSProperties = {
    ...textStyle,
    fontWeight: 600,
    fontStyle: "normal",
  };

  return (
    <div
      ref={ref}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: px(12),
        alignItems: "start",
        marginBottom: px(16),
        borderRadius: px(10),
        border: active ? "1px solid rgba(34,211,238,0.16)" : "1px solid transparent",
        background: active ? "rgba(34, 211, 238, 0.09)" : "transparent",
        padding: active ? px(4) : 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", minWidth: 0 }}>
        <div
          style={{
            width: px(4),
            alignSelf: "stretch",
            borderRadius: 999,
            background: stripeColor(exchangeStripeSpeaker(ex)),
            flexShrink: 0,
            minHeight: px(20),
            marginTop: px(2),
          }}
        />
        <p
          style={{ ...textStyle, paddingLeft: px(12), flex: 1, minWidth: 0 }}
          dir={isRtlLanguage(ex.originalLang) ? "rtl" : "ltr"}
        >
          {original}
          {typing ? <Caret /> : null}
        </p>
      </div>
      <div style={{ minWidth: 0, paddingTop: px(2) }}>
        <p
          style={{
            ...transStyle,
            opacity: translation ? translationOpacity : 0,
            transition: active ? "opacity 0.12s ease-out" : undefined,
          }}
          dir={isRtlLanguage(ex.translationLang) ? "rtl" : "ltr"}
        >
          {translation}
        </p>
      </div>
    </div>
  );
});

function Caret({ dim }: { dim?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 2,
        height: "0.9em",
        marginLeft: 2,
        verticalAlign: "text-bottom",
        background: dim ? "rgba(148,163,184,0.5)" : CYAN,
      }}
    />
  );
}
