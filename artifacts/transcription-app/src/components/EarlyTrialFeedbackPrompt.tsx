import { useState, useEffect } from "react";
import { Star, X, CheckCircle } from "lucide-react";

type Props = {
  planType?: string;
  trialExpired: boolean;
  minutesRemainingToday: number;
  dailyLimitMinutes: number;
};

const STORAGE_PROMPT_PREFIX = "ifai_trial_midday_";
const STORAGE_SUBMITTED_PREFIX = "ifai_trial_midday_submitted_";

function twoHourBucketKey() {
  const now = new Date();
  const bucket = Math.floor(now.getTime() / (2 * 60 * 60 * 1000));
  return `${STORAGE_PROMPT_PREFIX}${bucket}`;
}

function submittedTodayKey() {
  return `${STORAGE_SUBMITTED_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Re-prompts every 2 hours when ~1 hour remains, unless submitted that day.
 */
export function EarlyTrialFeedbackPrompt({
  planType,
  trialExpired,
  minutesRemainingToday,
  dailyLimitMinutes,
}: Props) {
  const [visible, setVisible]   = useState(false);
  const [animate, setAnimate]   = useState(false);
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const onTrial =
    (planType ?? "trial") === "trial" && !trialExpired && dailyLimitMinutes >= 60;
  const oneHourOrLessLeft =
    minutesRemainingToday > 0 && minutesRemainingToday <= 60;

  useEffect(() => {
    if (!onTrial || !oneHourOrLessLeft) return;
    if (localStorage.getItem(submittedTodayKey())) return;
    if (localStorage.getItem(twoHourBucketKey())) return;
    const t = setTimeout(() => {
      setVisible(true);
      setTimeout(() => setAnimate(true), 30);
    }, 2500);
    return () => clearTimeout(t);
  }, [onTrial, oneHourOrLessLeft, minutesRemainingToday]);

  const dismiss = () => {
    localStorage.setItem(twoHourBucketKey(), "dismissed");
    setAnimate(false);
    setTimeout(() => setVisible(false), 300);
  };

  const handleSubmit = async () => {
    if (rating < 1 || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/feedback", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          source:  "trial-daily-mid-session",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send feedback");
      localStorage.setItem(twoHourBucketKey(), "submitted");
      localStorage.setItem(submittedTodayKey(), "submitted");
      setDone(true);
      setTimeout(() => {
        setAnimate(false);
        setTimeout(() => setVisible(false), 320);
      }, 1800);
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
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-300 ${
        animate ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        className={`bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-transform duration-300 ${
          animate ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
      >
        {done ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-foreground">Thank you!</p>
            <p className="text-sm text-muted-foreground">Your feedback helps us improve InterpreterAI.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">How would you rate InterpreterAI so far?</h2>
              <button
                type="button"
                onClick={dismiss}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                You have about an hour of interpreting time left today. We&apos;d love a quick rating while you&apos;re in the flow.
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
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional feedback…"
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 text-sm rounded-xl border border-input bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              {err && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {err}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={rating < 1 || loading}
                  onClick={() => void handleSubmit()}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  {loading ? "Sending…" : "Submit Feedback"}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="px-4 h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Continue Session
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
