import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  hovered: number;
  onHover: (n: number) => void;
  onSelect: (n: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = { sm: "w-5 h-5", md: "w-7 h-7", lg: "w-8 h-8" } as const;

/** Visible in light and dark — empty stars use amber fill/stroke so they never look invisible. */
export function FeedbackStarRating({
  value,
  hovered,
  onHover,
  onSelect,
  size = "lg",
  className,
}: Props) {
  const display = hovered || value;
  const sizeClass = SIZE_CLASS[size];

  return (
    <div
      className={cn("flex items-center justify-center gap-1", className)}
      onMouseLeave={() => onHover(0)}
    >
      {[1, 2, 3, 4, 5].map((s) => {
        const active = s <= display;
        return (
          <button
            key={s}
            type="button"
            onMouseEnter={() => onHover(s)}
            onClick={() => onSelect(s)}
            className="p-1 transition-transform hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 rounded"
            aria-label={`${s} star${s === 1 ? "" : "s"}`}
          >
            <Star
              className={cn(
                sizeClass,
                "stroke-[1.75]",
                active
                  ? "text-amber-500 fill-amber-500 dark:text-amber-400 dark:fill-amber-400"
                  : "text-amber-700 fill-amber-100 stroke-amber-600 dark:text-amber-300 dark:fill-amber-950 dark:stroke-amber-400/90",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
