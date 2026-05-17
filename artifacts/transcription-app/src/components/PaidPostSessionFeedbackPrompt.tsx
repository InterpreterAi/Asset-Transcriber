import { useState, useEffect, useCallback } from "react";
import { Star, CheckCircle, AlertCircle } from "lucide-react";
import { isTrialLikePlanType } from "@/lib/utils";

type Props = {
  planType?: string;
  dailyLimitMinutes: number;
  minutesUsedToday: number;
  isRecording: boolean;
};

const MIN_COMMENT_LENGTH = 10;
/** Align with api-server `UNLIMITED_DAILY_CAP_MINUTES`. */
const UNLIMITED_DAILY_CAP_MINUTES = 9000;
const PAID_FEEDBACK_SOURCE = "paid-session-end-mandatory";

/**
 * Paid accounts only: after recording stops, if today’s usage is ≥ half the daily cap and the server
 * has no open session, prompt once for mandatory feedback (matches `FEEDBACK_REQUIRED` on next session).
 * Never shown while `isRecording` — server `paidPostSession.required` is false with an open session.
 */
export function PaidPostSessionFeedbackPrompt({
  planType,
  dailyLimitMinutes,
  minutesUsedToday,
  isRecording,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paidRequired, setPaidRequired] = useState(false);
  const [paidSubmitted, setPaidSubmitted] = useState(false);

  const gateApplies =
    !isTrialLikePlanType(planType) &&
    Number.isFinite(dailyLimitMinutes) &&
    dailyLimitMinutes > 0 &&
    dailyLimitMinutes < UNLIMITED_DAILY_CAP_MINUTES;

  const refreshStatus = useCallback(async () => {
    if (!gateApplies) return;
    try {
      const res = await fetch("/api/feedback/status", { method: "GET", credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        paidPostSession?: { required?: boolean; submitted?: boolean };
      };
      const ps = data.paidPostSession;
      setPaidRequired(Boolean(ps?.required));
      setPaidSubmitted(Boolean(ps?.submitted));
    } catch {
      /* non-blocking */
    }
  }, [gateApplies]);

  useEffect(() => {
    if (!gateApplies) return;
    void refreshStatus();
  }, [gateApplies, isRecording, minutesUsedToday, refreshStatus]);

  useEffect(() => {
    if (!gateApplies || isRecording) return;
    const t = setTimeout(() => void refreshStatus(), 900);
    return () => clearTimeout(t);
  }, [gateApplies, isRecording, minutesUsedToday, refreshStatus]);

  useEffect(() => {
    const shouldShow = paidRequired && !paidSubmitted && gateApplies && !isRecording;
    if (!shouldShow) {
      setAnimate(false);
      setVisible(false);
      return;
    }
    const t = setTimeout(() => {
      setVisible(true);
      setTimeout(() => setAnimate(true), 30);
    }, 400);
    return () => clearTimeout(t);
  }, [paidRequired, paidSubmitted, gateApplies, isRecording]);

  const canSubmit = rating >= 1 && comment.trim().length >= MIN_COMMENT_LENGTH;

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: comment.trim(),
          source: PAID_FEEDBACK_SOURCE,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send feedback");
      await refreshStatus();
      setDone(true);
      setTimeout(() => {
        setAnimate(false);
        setTimeout(() => setVisible(false), 320);
      }, 1600);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const displayStar = hovered || rating;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300 ${
        animate ? "opacity-100" : "opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paid-feedback-title"
    >
      <div
        className={`bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-transform duration-300 pointer-events-auto ${
          animate ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-foreground">Thank you!</p>
            <p className="text-sm text-muted-foreground">You can start your next session anytime.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-primary/5">
              <AlertCircle className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <h2 id="paid-feedback-title" className="text-sm font-semibold text-foreground">
                  Quick feedback after your session
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  You&apos;ve used about half of today&apos;s allowance. Please leave a rating and short comment once
                  before your next session.
                </p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Stars and a comment (at least {MIN_COMMENT_LENGTH} characters) are required. One submission covers
                today.
              </p>
              <div className="flex justify-center gap-1" onMouseLeave={() => setHovered(0)}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setHovered(s)}
                    onClick={() => setRating(s)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={`${s} stars`}
                  >
                    <Star
                      className={`w-8 h-8 ${
                        s <= displayStar ? "text-amber-400 fill-amber-400" : "text-muted/30"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Comment <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what’s working or what we should improve…"
                  rows={4}
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-input bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {comment.trim().length}/{MIN_COMMENT_LENGTH}+ characters required
                </p>
              </div>
              {err && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {err}
                </p>
              )}
              <button
                type="button"
                disabled={!canSubmit || loading}
                onClick={() => void handleSubmit()}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {loading ? "Sending…" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
