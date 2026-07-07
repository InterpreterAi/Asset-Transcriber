import { useState, useEffect } from "react";
import {
  X, Copy, Check, Share2,
} from "lucide-react";

interface InviteModalProps {
  userId:  number;
  username?: string | null;
  onClose: () => void;
}

function buildLink(userId: number, username?: string | null) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const u = encodeURIComponent((username ?? `${userId}`).trim());
  return `${window.location.origin}${base}/invite?ref=${userId}&u=${u}`;
}

const MSG =
  "I'm using InterpreterAI — a real-time AI transcription and translation tool for professional interpreters. Try it free for 7 days:";

async function trackShare(platform: string) {
  try {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${base}/api/share/event`, {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify({ platform }),
    });
  } catch {
    /* best-effort — don't block UX */
  }
}

export function InviteModal({ userId, username, onClose }: InviteModalProps) {
  const [copied, setCopied]         = useState(false);
  const [hasNativeShare, setNative] = useState(false);
  const link = buildLink(userId, username);

  useEffect(() => {
    setNative(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      void trackShare("copy");
    } catch {
      /* silent */
    }
  };

  const shareNative = async () => {
    try {
      await navigator.share({ title: "InterpreterAI", text: MSG, url: link });
      void trackShare("native");
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card text-card-foreground rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Invite a colleague</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Share InterpreterAI with another interpreter</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Link box */}
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your invitation link</p>
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl px-3 py-2.5">
            <span className="flex-1 text-xs font-mono text-foreground truncate">{link}</span>
            <button
              onClick={copyLink}
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                copied
                  ? "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/50"
                  : "bg-background text-foreground border border-border hover:bg-muted"
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div className="px-5 py-4 flex flex-col gap-2.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Share</p>

          {hasNativeShare && (
            <button
              onClick={shareNative}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              Share (device options)
            </button>
          )}
        </div>

        <div className="px-5 pb-5">
          <p className="text-[10px] text-muted-foreground/60 text-center">
            When they sign up via your link, you'll appear as their referrer in the system.
          </p>
        </div>
      </div>
    </div>
  );
}
