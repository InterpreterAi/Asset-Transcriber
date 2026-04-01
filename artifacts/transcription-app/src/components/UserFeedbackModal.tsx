import { useState } from "react";
import { MessageCircle, X, Send, CheckCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export function UserFeedbackModal({ isOpen, onClose, defaultEmail = "" }: Props) {
  const [email,   setEmail]   = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setMessage(""); setError(null); setSent(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/support", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:   email.trim(),
          subject: "[User Feedback]",
          message: message.trim(),
        }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-violet-600" />
            </div>
            <h2 className="text-sm font-semibold">Send Feedback</h2>
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
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Feedback received!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Thank you for helping us improve InterpreterAI.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="mt-1 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Share your thoughts, feature requests, or anything that would make InterpreterAI better for you.
              </p>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full h-9 px-3 text-xs rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Your feedback or feature request…"
                  required
                  minLength={10}
                  rows={4}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || !message.trim()}
                className="w-full h-9 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {loading ? "Sending…" : "Send Feedback"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
