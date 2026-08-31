import type { ReactNode } from "react";

/** Informational brand marks only. Paddle decides which methods appear in checkout. */

function LogoFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex h-7 items-center justify-center rounded-md border border-border/80 bg-white px-1.5 min-w-[2.65rem] shadow-sm"
      title={label}
      aria-label={label}
    >
      {children}
    </span>
  );
}

function VisaMark() {
  return (
    <svg viewBox="0 0 48 16" className="h-3.5 w-9" aria-hidden>
      <path
        fill="#1A1F71"
        d="M18.3 15.1h-3.2L17.6.9h3.2l-2.5 14.2zm13.9-14.4c-.6-.3-1.6-.5-2.9-.5-3.1 0-5.3 1.7-5.3 4.1 0 1.8 1.6 2.8 2.8 3.4 1.2.6 1.7 1 1.7 1.6 0 .8-1 1.2-1.9 1.2-1.3 0-2-.2-3.1-.7l-.4-.2-.5 3c.8.4 2.3.7 3.9.7 3.3 0 5.4-1.6 5.4-4.2 0-1.4-.8-2.5-2.6-3.4-1.1-.6-1.8-1-1.8-1.6 0-.5.6-1.1 1.8-1.1 1 0 1.8.2 2.4.5l.3.1.4-2.9zm7.7 14.4h2.8L40.3.9h-2.6c-.8 0-1.4.2-1.8 1l-6.4 13.2h3.3l.9-2.5h4l.5 2.5zm-3.5-5 1.6-4.5.9 4.5h-2.5zM15.1.9l-3.1 9.1-.3-1.7C11.1 6 9.4 3.8 7.5 2.7 7.5 2.7 7.4 2.6 6.3 2.2L6.2.9h5.3c.7 0 1.3.5 1.4 1.3l1.3 6.7 3.2-8h3.2L15.1.9zM8.4 15.1 5.8.9H2.7L.1 11.2C0 11.8-.1 12 .3 12.3c1.3.7 2.3 1.2 3.4 1.7l.8-4.1.8 5.2h3.1z"
      />
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg viewBox="0 0 36 22" className="h-4 w-7" aria-hidden>
      <circle cx="13.5" cy="11" r="8.2" fill="#EB001B" />
      <circle cx="22.5" cy="11" r="8.2" fill="#F79E1B" />
      <path
        fill="#FF5F00"
        d="M18 4.6a8.2 8.2 0 0 1 0 12.8 8.2 8.2 0 0 1 0-12.8z"
      />
    </svg>
  );
}

function AmexMark() {
  return (
    <svg viewBox="0 0 40 16" className="h-3.5 w-8" aria-hidden>
      <rect width="40" height="16" rx="2" fill="#2E77BC" />
      <text x="20" y="11.2" textAnchor="middle" fill="#fff" fontSize="7" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700">
        AMEX
      </text>
    </svg>
  );
}

function ApplePayMark() {
  return (
    <svg viewBox="0 0 48 16" className="h-3.5 w-10" aria-hidden>
      <path
        fill="#111"
        d="M8.3 3.6c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.4-.7 1.1-.6 1.8.7.1 1.3-.3 1.7-.8zm.1 1.1c-1 0-1.8.6-2.3.6-.5 0-1.2-.5-2-.5-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.7.8 6.2.5.8 1.1 1.6 1.9 1.6s1.1-.5 2-.5 1.2.5 2 .5 1.3-.7 1.8-1.5c.6-.9.8-1.7.8-1.8 0 0-1.6-.6-1.6-2.4 0-1.5 1.2-2.2 1.3-2.3-.7-1.1-1.8-1.2-2.2-1.4z"
      />
      <text x="30.5" y="12.2" textAnchor="middle" fill="#111" fontSize="8.2" fontFamily="Arial, Helvetica, sans-serif" fontWeight="600">
        Pay
      </text>
    </svg>
  );
}

function GooglePayMark() {
  return (
    <svg viewBox="0 0 52 16" className="h-3.5 w-11" aria-hidden>
      <path fill="#4285F4" d="M10.2 8.1c0-.3 0-.6-.1-.8H6.4v1.6h2.1c-.1.5-.4 1-.9 1.3v1.1h1.4c.8-.8 1.2-1.9 1.2-3.2z" />
      <path fill="#34A853" d="M6.4 12.6c1.2 0 2.2-.4 3-1.1l-1.4-1.1c-.4.3-.9.5-1.6.5-1.2 0-2.2-.8-2.6-1.9H2.3v1.2c.7 1.5 2.3 2.4 4.1 2.4z" />
      <path fill="#FBBC05" d="M3.8 8.9c-.1-.3-.2-.6-.2-.9s.1-.6.2-.9V5.9H2.3C2 6.5 1.8 7.2 1.8 8s.2 1.5.5 2.1l1.5-1.2z" />
      <path fill="#EA4335" d="M6.4 3.8c.7 0 1.3.2 1.8.7l1.3-1.3C8.6 2.2 7.6 1.8 6.4 1.8 4.6 1.8 3 2.7 2.3 4.2l1.5 1.2c.4-1.1 1.4-1.6 2.6-1.6z" />
      <text x="33" y="12.2" textAnchor="middle" fill="#3C4043" fontSize="8.2" fontFamily="Arial, Helvetica, sans-serif" fontWeight="600">
        Pay
      </text>
    </svg>
  );
}

export function PaymentMethodLogos() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" role="list" aria-label="Accepted payment methods">
      <LogoFrame label="Visa">
        <VisaMark />
      </LogoFrame>
      <LogoFrame label="Mastercard">
        <MastercardMark />
      </LogoFrame>
      <LogoFrame label="American Express">
        <AmexMark />
      </LogoFrame>
      <LogoFrame label="Apple Pay">
        <ApplePayMark />
      </LogoFrame>
      <LogoFrame label="Google Pay">
        <GooglePayMark />
      </LogoFrame>
    </div>
  );
}
