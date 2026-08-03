import { brandColors } from "../tokens";
import { cn } from "../cn";

export function LiveBadge({
  active = true,
  timer,
  className,
}: {
  active?: boolean;
  timer?: string;
  className?: string;
}) {
  if (!active) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white border shrink-0",
        "shadow-[0_0_0_1px_rgba(220,38,38,0.35)]",
        className,
      )}
      style={{
        backgroundColor: brandColors.live,
        borderColor: "#EF4444",
        animation: "brand-live-pulse 1.6s ease-in-out infinite",
      }}
      role="status"
      aria-live="polite"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
      <span className="text-[10px] font-bold tracking-widest">LIVE</span>
      {timer ? (
        <span className="text-[10px] font-semibold tabular-nums tracking-normal opacity-95">
          {timer}
        </span>
      ) : null}
      <style>{`
        @keyframes brand-live-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
          50% { box-shadow: 0 0 0 4px ${brandColors.liveSoft}; }
        }
      `}</style>
    </div>
  );
}
