import { useState } from "react";
import { Star, X, Send, CheckCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export function UserFeedbackModal({ isOpen, onClose }: Props) {
  const [rating,  setRating]  = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setRating(0); setHovered(0); setComment(""); setError(null); setSent(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { setError("Please select a star rating."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const displayStar = hovered || rating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
            </div>
            <h2 className="text-sm font-semibold">Rate your experience</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {sent ? (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Thank you!</p>
                <p className="text-xs text-muted-foreground mt-1">Your feedback helps us improve InterpreterAI.</p>
              </div>
              <div className="flex gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-5 h-5 ${s <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
                ))}
              </div>
              <button
                onClick={handleClose}
                className="mt-2 px-5 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                How would you rate InterpreterAI overall? Your feedback helps us improve.
              </p>

              {/* Star picker */}
              <div className="flex flex-col items-center gap-2 py-2">
                <div
                  className="flex gap-1.5"
                  onMouseLeave={() => setHovered(0)}
                >
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      type="button"
                      onMouseEnter={() => setHovered(s)}
                      onClick={() => setRating(s)}
                      className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                      aria-label={`${s} star${s !== 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`w-9 h-9 transition-colors ${
                          s <= displayStar
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-200 fill-gray-200"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className={`text-xs font-semibold transition-opacity ${displayStar ? "opacity-100" : "opacity-0"} ${
                  displayStar >= 4 ? "text-green-600" : displayStar === 3 ? "text-amber-600" : "text-red-500"
                }`}>
                  {STAR_LABELS[displayStar]}
                </p>
              </div>

              {/* Comment */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Comment <span className="font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Anything you'd like us to know or improve…"
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-0.5">{comment.length}/500</p>
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || rating === 0}
                className="w-full h-9 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {loading ? "Sending…" : "Submit Rating"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
