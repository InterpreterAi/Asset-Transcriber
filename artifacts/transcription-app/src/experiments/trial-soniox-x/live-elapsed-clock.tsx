import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/** Owns the session timer so 250ms ticks do not re-render the live transcript. */
export function LiveElapsedClock({
  active,
  startedAt,
}: {
  active: boolean;
  startedAt: number | null;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active || startedAt == null) {
      setElapsedMs(0);
      return;
    }
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [active, startedAt]);

  if (!active) return null;

  const elapsedSecs = Math.floor(elapsedMs / 1000);
  const elapsedLabel = `${String(Math.floor(elapsedSecs / 60)).padStart(2, "0")}:${String(elapsedSecs % 60).padStart(2, "0")}`;

  return (
    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-200 shrink-0 font-mono">
      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse sm:hidden" />
      <Clock className="w-3 h-3 hidden sm:block" />
      <span className="sm:hidden">Live</span>
      {elapsedLabel}
    </span>
  );
}
