import { useState, useEffect } from "react";
import {
  X, Copy, Check, Mail, Linkedin, Share2,
  MessageCircle,
} from "lucide-react";

interface InviteModalProps {
  userId:  number;
  onClose: () => void;
}

function buildLink(userId: number) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/invite?ref=${userId}`;
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

export function InviteModal({ userId, onClose }: InviteModalProps) {
  const [copied, setCopied]         = useState(false);
  const [hasNativeShare, setNative] = useState(false);
  const link = buildLink(userId);

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

  const encoded      = encodeURIComponent(link);
  const encodedFull  = encodeURIComponent(`${MSG}\n${link}`);

  const shareButtons = [
    {
      label:    "WhatsApp",
      platform: "whatsapp",
      color:    "bg-[#25D366] hover:bg-[#1ebe5d] text-white",
      icon:     (
        <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
      href: `https://wa.me/?text=${encodedFull}`,
    },
    {
      label:    "Telegram",
      platform: "telegram",
      color:    "bg-[#0088cc] hover:bg-[#0077bb] text-white",
      icon:     (
        <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
      href: `https://t.me/share/url?url=${encoded}&text=${encodeURIComponent(MSG)}`,
    },
    {
      label:    "Email",
      platform: "email",
      color:    "bg-muted hover:bg-muted/80 text-foreground border border-border",
      icon:     <Mail className="w-4 h-4 shrink-0" />,
      href:     `mailto:?subject=${encodeURIComponent("Join me on InterpreterAI")}&body=${encodedFull}`,
    },
    {
      label:    "LinkedIn",
      platform: "linkedin",
      color:    "bg-[#0077B5] hover:bg-[#006699] text-white",
      icon:     <Linkedin className="w-4 h-4 shrink-0" />,
      href:     `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">

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
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : "bg-white text-foreground border border-border hover:bg-muted"
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div className="px-5 py-4 flex flex-col gap-2.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Share via</p>

          {hasNativeShare && (
            <button
              onClick={shareNative}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              Share (device options)
            </button>
          )}

          {shareButtons.map(btn => (
            <a
              key={btn.label}
              href={btn.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void trackShare(btn.platform)}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${btn.color}`}
            >
              {btn.icon}
              {btn.label}
            </a>
          ))}
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
