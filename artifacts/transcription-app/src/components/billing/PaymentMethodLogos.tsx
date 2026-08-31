import type { ReactNode } from "react";

function BrandChip({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} — continue with card`}
      aria-label={`Pay with ${label}`}
      className="inline-flex h-12 min-w-[4.75rem] items-center justify-center rounded-xl bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.12),0_8px_16px_-10px_rgba(0,0,0,0.25)] ring-1 ring-black/5 transition enabled:hover:-translate-y-px enabled:hover:shadow-md enabled:active:translate-y-0 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function VisaMark() {
  return (
    <svg viewBox="0 0 48 16" className="h-5 w-11" aria-hidden>
      <path
        fill="#1A1F71"
        d="M18.3 15.1h-3.2L17.6.9h3.2l-2.5 14.2zm13.9-14.4c-.6-.3-1.6-.5-2.9-.5-3.1 0-5.3 1.7-5.3 4.1 0 1.8 1.6 2.8 2.8 3.4 1.2.6 1.7 1 1.7 1.6 0 .8-1 1.2-1.9 1.2-1.3 0-2-.2-3.1-.7l-.4-.2-.5 3c.8.4 2.3.7 3.9.7 3.3 0 5.4-1.6 5.4-4.2 0-1.4-.8-2.5-2.6-3.4-1.1-.6-1.8-1-1.8-1.6 0-.5.6-1.1 1.8-1.1 1 0 1.8.2 2.4.5l.3.1.4-2.9zm7.7 14.4h2.8L40.3.9h-2.6c-.8 0-1.4.2-1.8 1l-6.4 13.2h3.3l.9-2.5h4l.5 2.5zm-3.5-5 1.6-4.5.9 4.5h-2.5zM15.1.9l-3.1 9.1-.3-1.7C11.1 6 9.4 3.8 7.5 2.7 7.5 2.7 7.4 2.6 6.3 2.2L6.2.9h5.3c.7 0 1.3.5 1.4 1.3l1.3 6.7 3.2-8h3.2L15.1.9zM8.4 15.1 5.8.9H2.7L.1 11.2C0 11.8-.1 12 .3 12.3c1.3.7 2.3 1.2 3.4 1.7l.8-4.1.8 5.2h3.1z"
      />
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg viewBox="0 0 36 22" className="h-6 w-10" aria-hidden>
      <circle cx="13.5" cy="11" r="8.2" fill="#EB001B" />
      <circle cx="22.5" cy="11" r="8.2" fill="#F79E1B" />
      <path fill="#FF5F00" d="M18 4.6a8.2 8.2 0 0 1 0 12.8 8.2 8.2 0 0 1 0-12.8z" />
    </svg>
  );
}

function AmexMark() {
  return (
    <svg viewBox="0 0 48 30" className="h-7 w-11" aria-hidden>
      <rect width="48" height="30" rx="4" fill="#2E77BC" />
      <text
        x="24"
        y="20"
        textAnchor="middle"
        fill="#fff"
        fontSize="11"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        letterSpacing="0.6"
      >
        AMEX
      </text>
    </svg>
  );
}

function ApplePayMark() {
  return (
    <svg viewBox="0 0 62 20" className="h-5 w-[3.6rem]" aria-hidden>
      <path
        fill="#111"
        d="M9.7 4.4c.55-.66.92-1.55.82-2.46-.79.03-1.75.53-2.31 1.19-.5.58-.94 1.51-.82 2.4.87.07 1.76-.44 2.31-1.13zM9.85 5.8c-1.3 0-2.35.78-2.99.78-.66 0-1.63-.74-2.69-.72-1.38.02-2.65.8-3.35 2.04-1.43 2.48-.37 6.14 1.02 8.15.68.99 1.49 2.09 2.55 2.05 1.02-.04 1.41-.66 2.65-.66 1.23 0 1.58.66 2.67.64 1.11-.02 1.81-1 2.49-1.99.77-1.13 1.09-2.23 1.11-2.28-.02 0-2.16-.83-2.18-3.28-.02-2.05 1.68-3.03 1.75-3.08-.96-1.41-2.45-1.57-2.97-1.65z"
      />
      <text
        x="44"
        y="15.2"
        textAnchor="middle"
        fill="#111"
        fontSize="11.5"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', Arial, sans-serif"
        fontWeight="500"
      >
        Pay
      </text>
    </svg>
  );
}

function GooglePayMark() {
  return (
    <svg viewBox="0 0 68 20" className="h-5 w-[4.1rem]" aria-hidden>
      <path fill="#4285F4" d="M12.6 10.1c0-.42-.04-.82-.1-1.21H7.7v2.29h2.75c-.12.64-.48 1.19-1.02 1.55v1.29h1.65c.96-.89 1.52-2.19 1.52-3.92z" />
      <path fill="#34A853" d="M7.7 16.1c1.55 0 2.85-.51 3.8-1.39l-1.65-1.28c-.46.31-1.04.49-1.15.49-1.55 0-2.87-1.05-3.34-2.46H2.65v1.33c.94 1.86 2.87 3.12 5.05 3.12z" />
      <path fill="#FBBC05" d="M4.36 11.46c-.12-.35-.19-.73-.19-1.12 0-.39.07-.77.19-1.12V7.89H2.65A5.4 5.4 0 0 0 2 10.34c0 .88.21 1.71.65 2.45l1.71-1.33z" />
      <path fill="#EA4335" d="M7.7 4.95c.84 0 1.6.29 2.19.86l1.64-1.64C10.53 3.22 9.2 2.7 7.7 2.7c-2.18 0-4.11 1.25-5.05 3.12l1.71 1.33c.47-1.41 1.79-2.2 3.34-2.2z" />
      <text
        x="46.5"
        y="14.6"
        textAnchor="middle"
        fill="#3C4043"
        fontSize="11.5"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="600"
      >
        Pay
      </text>
    </svg>
  );
}

export function PayPalMark({ className = "h-6 w-[5.5rem]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 20" className={className} aria-hidden>
      <path
        fill="#003087"
        d="M12.1 1.2h-7.2c-.4 0-.8.3-.9.7L1.3 18.2c0 .3.2.5.5.5h3.4c.3 0 .5-.2.5-.4l.7-4.3.1-.4c.1-.4.5-.7.9-.7h2.1c4.1 0 6.5-2 7.1-5.9.3-1.7 0-3-.9-4-.9-1-2.5-1.8-5.6-1.8zm.8 5.9c-.3 2.2-2 2.2-3.7 2.2h-.9l.7-4.2v-.2h1c1.8 0 3.4 0 3.1 2.2z"
      />
      <path
        fill="#009CDE"
        d="M30.2 6.9h-3.4c-.2 0-.4.1-.4.2l-.2.9-.2-.3c-.7-1-2.1-1.3-3.5-1.3-3.3 0-6.1 2.5-6.7 6-.3 1.8.1 3.5 1.1 4.6.9 1 2.2 1.4 3.8 1.4 2.7 0 4.2-1.7 4.2-1.7l-.1.8c0 .3.2.5.5.5h3c.4 0 .8-.3.9-.7l1.7-10.7c0-.3-.2-.5-.5-.5h.2zm-3.3 5.9c-.3 1.8-1.8 3-3.5 3-1.4 0-2.5-1.1-2.2-2.6.3-1.8 1.8-3.1 3.4-3.1 1.4 0 2.5 1.1 2.3 2.7z"
      />
      <path
        fill="#003087"
        d="M48.3 6.9h-3.4c-.2 0-.5.1-.6.4l-3.4 5.1-1.4-5c-.1-.4-.5-.6-.9-.6h-3.3c-.3 0-.5.3-.4.6l2.7 8.1-2.5 3.6c-.2.3 0 .7.4.7h3.3c.3 0 .5-.1.6-.4l8.1-11.8c.3-.3 0-.7-.3-.7h.1z"
      />
      <path
        fill="#009CDE"
        d="M54.8 1.2h-7.2c-.4 0-.8.3-.9.7l-2.7 16.3c0 .3.2.5.5.5h3.6c.4 0 .7-.3.8-.6l.7-4.1.1-.4c.1-.4.5-.7.9-.7h2.1c4.1 0 6.5-2 7.1-5.9.3-1.7 0-3-.9-4-.9-1-2.5-1.8-5.6-1.8h1.5zm.8 5.9c-.3 2.2-2 2.2-3.7 2.2h-.9l.7-4.2v-.2h1c1.8 0 3.4 0 3.1 2.2h-.2z"
      />
      <path
        fill="#012169"
        d="M72.9 6.9h-3.4c-.2 0-.4.1-.4.2l-.2.9-.2-.3c-.7-1-2.1-1.3-3.5-1.3-3.3 0-6.1 2.5-6.7 6-.3 1.8.1 3.5 1.1 4.6.9 1 2.2 1.4 3.8 1.4 2.7 0 4.2-1.7 4.2-1.7l-.1.8c0 .3.2.5.5.5h3c.4 0 .8-.3.9-.7l1.7-10.7c0-.3-.2-.5-.5-.5h-.2zm-3.3 5.9c-.3 1.8-1.8 3-3.5 3-1.4 0-2.5-1.1-2.2-2.6.3-1.8 1.8-3.1 3.4-3.1 1.4 0 2.5 1.1 2.3 2.7z"
      />
    </svg>
  );
}

/** Card brands open Paddle overlay checkout. PayPal is a separate control. */
export function PaymentMethodLogos({
  onPaddleCheckout,
  disabled,
}: {
  onPaddleCheckout?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5" role="list" aria-label="Pay with card">
      <BrandChip label="Visa" onClick={onPaddleCheckout} disabled={disabled}>
        <VisaMark />
      </BrandChip>
      <BrandChip label="Mastercard" onClick={onPaddleCheckout} disabled={disabled}>
        <MastercardMark />
      </BrandChip>
      <BrandChip label="American Express" onClick={onPaddleCheckout} disabled={disabled}>
        <AmexMark />
      </BrandChip>
      <BrandChip label="Apple Pay" onClick={onPaddleCheckout} disabled={disabled}>
        <ApplePayMark />
      </BrandChip>
      <BrandChip label="Google Pay" onClick={onPaddleCheckout} disabled={disabled}>
        <GooglePayMark />
      </BrandChip>
    </div>
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
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#FFC439] text-[#003087] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition hover:bg-[#f5b82e] disabled:opacity-50"
      aria-label="Pay with PayPal"
    >
      {loading ? (
        <span className="text-sm font-semibold">Opening PayPal…</span>
      ) : (
        <>
          <PayPalMark />
          <span className="text-sm font-semibold tracking-tight">Checkout</span>
        </>
      )}
    </button>
  );
}
