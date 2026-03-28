import { motion } from "framer-motion";

export function AudioMeter({ level, label, hideLabel = false }: { level: number; label: string; hideLabel?: boolean }) {
  // Map 0-100 to colors: Green -> Yellow -> Red
  let color = "bg-green-500";
  if (level > 60) color = "bg-yellow-400";
  if (level > 85) color = "bg-red-500";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {!hideLabel && (
        <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
          <span>{label}</span>
          <span>{Math.round(level)}%</span>
        </div>
      )}
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden flex shadow-inner">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, level))}%` }}
          transition={{ type: "tween", ease: "linear", duration: 0.1 }}
        />
      </div>
    </div>
  );
}
