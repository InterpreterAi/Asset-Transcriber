import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, CheckCircle } from "lucide-react";
import { Button } from "./ui-components";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: Props) {
  const [rating, setRating]       = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment]     = useState("");
  const [pending, setPending]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setComment("");
      setError(null);
      setSuccess(false);
      setHoverRating(0);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (rating === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          source:  "trial-ended",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not submit feedback");
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-card border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative"
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {success ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-9 h-9 text-green-400" />
                  </div>
                  <p className="text-lg font-semibold text-white">Thanks — we got your feedback!</p>
                  <p className="text-sm text-muted-foreground">Closing…</p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Star className="w-8 h-8 text-primary fill-primary" />
                    </div>
                    <h2 className="text-2xl font-display font-bold text-white mb-2">How was your trial?</h2>
                    <p className="text-muted-foreground text-sm">
                      Your trial has ended. We&apos;d love to hear about your experience to help us improve.
                    </p>
                  </div>

                  <div className="flex justify-center gap-2 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(star)}
                        className="p-1 transition-transform hover:scale-110 active:scale-95"
                      >
                        <Star
                          className={`w-8 h-8 transition-colors ${
                            star <= (hoverRating || rating)
                              ? "text-accent fill-accent"
                              : "text-white/20"
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  <div className="mb-4">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Tell us more about your experience... (optional)"
                      className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary h-24 resize-none transition-all"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive mb-3 text-center bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <Button
                    type="button"
                    className="w-full"
                    size="lg"
                    disabled={rating === 0 || pending}
                    isLoading={pending}
                    onClick={() => void handleSubmit()}
                  >
                    Submit Feedback
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
