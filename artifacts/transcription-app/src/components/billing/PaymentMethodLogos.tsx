import type { ReactNode } from "react";
import { CreditCard } from "lucide-react";

function BrandBox({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Pay by card with ${label}`}
      className="inline-flex h-12 min-w-[5.25rem] items-center justify-center rounded-xl bg-white px-3 ring-1 ring-black/5 transition enabled:hover:-translate-y-px enabled:hover:shadow-md disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function VisaMark() {
  return (
    <svg viewBox="0 0 60 20" className="h-[18px] w-[52px]" aria-hidden>
      <text
        x="30"
        y="16"
        textAnchor="middle"
        fill="#1A1F71"
        fontSize="16"
        fontStyle="italic"
        fontWeight="800"
        fontFamily="Arial, Helvetica, sans-serif"
        letterSpacing="1.4"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg viewBox="0 0 38 24" className="h-6 w-[38px]" aria-hidden>
      <circle cx="14" cy="12" r="9" fill="#EB001B" />
      <circle cx="24" cy="12" r="9" fill="#F79E1B" />
      <path fill="#FF5F00" d="M19 4.6a9 9 0 0 1 0 14.8 9 9 0 0 1 0-14.8z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 17 20" className="h-[18px] w-[15px]" aria-hidden>
      <path
        fill="#111"
        d="M13.9 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-1-3-.9c-1.5.1-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.4-1-2.5-3.4zM11.6 3.7c.6-.8 1.1-1.8 1-2.9-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.8 1.1.1 2.2-.5 2.8-1.4z"
      />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M19.6 10.2c0-.7-.1-1.4-.2-2H10v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M10 20c2.7 0 5-0.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H1.1v2.6A10 10 0 0 0 10 20z" />
      <path fill="#FBBC05" d="M4.4 11.9A6 6 0 0 1 4.1 10c0-.7.1-1.3.3-1.9V5.5H1.1A10 10 0 0 0 0 10c0 1.6.4 3.1 1.1 4.5l3.3-2.6z" />
      <path fill="#EA4335" d="M10 4c1.5 0 2.8.5 3.8 1.5l2.9-2.9C15 1 12.7 0 10 0 6.1 0 2.7 2.2 1.1 5.5l3.3 2.6C5.2 5.8 7.4 4 10 4z" />
    </svg>
  );
}

function PayWord() {
  return (
    <span className="text-[15px] leading-none font-semibold tracking-tight text-neutral-900">
      Pay
    </span>
  );
}

export function AcceptedCardMethods({
  onPayByCard,
  disabled,
}: {
  onPayByCard?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5" aria-label="Accepted cards">
      <BrandBox label="Visa" onClick={onPayByCard} disabled={disabled}>
        <VisaMark />
      </BrandBox>
      <BrandBox label="Mastercard" onClick={onPayByCard} disabled={disabled}>
        <MastercardMark />
      </BrandBox>
      <BrandBox label="Apple Pay" onClick={onPayByCard} disabled={disabled}>
        <span className="inline-flex items-center gap-1.5">
          <AppleLogo />
          <PayWord />
        </span>
      </BrandBox>
      <BrandBox label="Google Pay" onClick={onPayByCard} disabled={disabled}>
        <span className="inline-flex items-center gap-1.5">
          <GoogleG />
          <PayWord />
        </span>
      </BrandBox>
    </div>
  );
}

export function PayByCardButton({
  onClick,
  disabled,
  loading,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-400 transition disabled:opacity-50"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <CreditCard className="w-4 h-4" aria-hidden />
      )}
      {loading ? "Opening checkout…" : "Pay by card"}
    </button>
  );
}

function PayPalWordmark() {
  return (
    <span className="inline-flex items-baseline text-[1.35rem] leading-none font-semibold tracking-tight" aria-hidden>
      <span style={{ color: "#003087" }}>Pay</span>
      <span style={{ color: "#009cde" }}>Pal</span>
    </span>
  );
}

export function PayPalCheckoutButton({
  onClick,
  disabled,
  loading,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex h-12 w-full items-center justify-center rounded-xl bg-[#FFC439] transition hover:bg-[#f5b82e] disabled:opacity-50"
      aria-label="Pay with PayPal"
    >
      {loading ? (
        <span className="text-sm font-semibold text-[#003087]">Opening PayPal…</span>
      ) : (
        <PayPalWordmark />
      )}
    </button>
  );
}
