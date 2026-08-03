/**
 * Exact clone of landing BrandWordmark (MarketingNav / landing navbar):
 *   rounded-lg bg-primary/10 + Zap (stroke 2.2)
 *   Interpreter (white on dark) + AI (primary blue #2563EB)
 */
import { Zap } from "lucide-react";

interface LogoProps {
  variant?: "wordmark" | "mark";
  className?: string;
  /** Mark tile size in px. Landing uses 36 (w-9). */
  height?: number;
}

/** Landing marketing primary — hsl(221 83% 53%) */
const PRIMARY = "#2563EB";
const PRIMARY_TILE = "rgba(37, 99, 235, 0.10)";

function Mark({ size, className }: { size: number; className?: string }) {
  // Landing: tile w-9 (36) → Zap w-4 (16)
  const icon = Math.max(12, Math.round(size * (16 / 36)));
  const radius = Math.max(6, Math.round(size * (8 / 36))); // rounded-lg scale

  return (
    <div
      className={className}
      aria-label="InterpreterAI"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        backgroundColor: PRIMARY_TILE,
        color: PRIMARY,
      }}
    >
      <Zap
        width={icon}
        height={icon}
        strokeWidth={2.2}
        stroke={PRIMARY}
        fill="none"
        color={PRIMARY}
        aria-hidden
      />
    </div>
  );
}

export function InterpreterAILogo({
  variant = "wordmark",
  className,
  height = 36,
}: LogoProps) {
  if (variant === "mark") {
    return <Mark size={height} className={className} />;
  }

  // Landing: text-[17px] next to w-9 (36px) mark
  const textSize = Math.max(14, Math.round(height * (17 / 36)));

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.max(8, Math.round(height * (8 / 36))),
        minWidth: 0,
      }}
      aria-label="InterpreterAI"
    >
      <Mark size={height} />
      <span
        style={{
          fontSize: textSize,
          fontWeight: 600,
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          color: "#FFFFFF",
        }}
      >
        Interpreter
        <span style={{ color: PRIMARY }}>AI</span>
      </span>
    </div>
  );
}
