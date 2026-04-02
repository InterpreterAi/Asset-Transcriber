import { useState, useEffect } from "react";
import { Star, X, Send, CheckCircle, Sparkles } from "lucide-react";

interface Props {
  minutesUsedToday: number;
  triggerMinutes?: number;
}

const STAR_LABELS  = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
const RECOMMEND_OPTIONS = [
  { value: "yes",   label: "Yes! 👍" },
  { value: "maybe", label: "Not sure 🤔" },
  { value: "no",    label: "Probably not 👎" },
] as const;

function todayKey() {
  return `ifai_fp_${new Date().toISOString().slice(0, 10)}`;
}

export function DailyFeedbackPrompt({ minutesUsedToday, triggerMinutes = 180 }: Props) {
  const [visible,   setVisible]   = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [rating,    setRating]    = useState(0);
  const [hovered,   setHovered]   = useState(0);
  const [recommend, setRecommend] = useState<string | null>(null);
  const [comment,   setComment]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  // Trigger: show once per day after hitting the minute threshold
  useEffect(() => {
    if (minutesUsedToday < triggerMinutes) return;
    const stored = localStorage.getItem(todayKey());
    if (stored) return; // already shown / dismissed today
    // Small delay so it doesn't pop the instant they hit the threshold
    const t = setTimeout(() => {
      setVisible(true);
      setTimeout(() => setAnimateIn(true), 30);
    }, 4000);
    return () => clearTimeout(t);
  }, [minutesUsedToday, triggerMinutes]);

  const dismiss = () => {
    localStorage.setItem(todayKey(), "skip");
    setAnimateIn(false);
    setTimeout(() => setVisible(false), 350);
  };

  const handleSubmit = async () => {
    if (!rating || loading) return;
    setLoading(true);
    try {
      await fetch("/api/feedback", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          recommend: recommend ?? undefined,
          comment:   comment.trim() || undefined,
          source:    "daily-prompt",
        }),
      });
    } catch { /* best effort */ }
    localStorage.setItem(todayKey(), "done");
    setLoading(false);
    setDone(true);
    setTimeout(() => {
      setAnimateIn(false);
      setTimeout(() => setVisible(false), 400);
    }, 2200);
  };

  if (!visible) return null;

  const displayStar = hovered || rating;

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden transition-all duration-350 ${
        animateIn ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
      style={{ transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease" }}
    >
      {done ? (
        /* ── Success state ──────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center py-7 px-5 gap-3 text-center">
          <div className="w-11 h-11 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-sm">Thanks for the feedback!</p>
            <p className="text-xs text-muted-foreground mt-1">It really helps us improve.</p>
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className={`w-4 h-4 ${s <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── Header ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-violet-50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Quick feedback?</span>
            </div>
            <button
              onClick={dismiss}
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* ── Stars ────────────────────────────────────────────── */}
            <div>
              <p className="text-xs text-muted-foreground mb-2.5">How would you rate InterpreterAI?</p>
              <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setHovered(s)}
                    onClick={() => setRating(s)}
                    className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                  >
                    <Star className={`w-7 h-7 transition-colors ${s <= displayStar ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
                  </button>
                ))}
                {displayStar > 0 && (
                  <span className={`ml-1.5 text-xs font-medium ${displayStar >= 4 ? "text-green-600" : displayStar === 3 ? "text-amber-600" : "text-red-500"}`}>
                    {STAR_LABELS[displayStar]}
                  </span>
                )}
              </div>
            </div>

            {/* ── Recommend ─────────────────────────────────────────── */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Would you recommend us to a colleague?</p>
              <div className="flex gap-1.5 flex-wrap">
                {RECOMMEND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecommend(r => r === opt.value ? null : opt.value)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-all font-medium ${
                      recommend === opt.value
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-gray-50 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Comment ───────────────────────────────────────────── */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Anything you'd like to add? (optional)"
              rows={2}
              maxLength={300}
              className="w-full px-3 py-2 text-xs rounded-xl border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary resize-none leading-relaxed placeholder:text-muted-foreground/60 transition-all"
            />

            {/* ── Actions ───────────────────────────────────────────── */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleSubmit()}
                disabled={rating === 0 || loading}
                className="flex-1 h-8 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {loading
                  ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Send className="w-3 h-3" /> Submit</>
                }
              </button>
              <button
                onClick={dismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                Maybe later
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
