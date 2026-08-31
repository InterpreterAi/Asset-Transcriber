import { CreditCard } from "lucide-react";

const CARD_METHODS = ["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay"] as const;

export function AcceptedCardMethods({
  onPayByCard,
  disabled,
}: {
  onPayByCard?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Accepted cards">
      {CARD_METHODS.map((label) => (
        <button
          key={label}
          type="button"
          onClick={onPayByCard}
          disabled={disabled}
          className="h-9 px-3 rounded-lg border border-white/12 bg-white/[0.04] text-[12px] font-medium text-slate-200 hover:bg-white/[0.08] hover:border-white/20 transition disabled:opacity-45"
          aria-label={`Pay by card with ${label}`}
        >
          {label}
        </button>
      ))}
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
