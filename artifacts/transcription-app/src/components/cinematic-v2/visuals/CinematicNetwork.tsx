import { motion } from "framer-motion";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";
import { PRICING_PLANS } from "@/lib/pricing-copy";

type NodeDef = {
  id: string;
  label: string;
  angle: number;
  dist: number;
  emergeAt: number;
};

const USE_NODES: NodeDef[] = [
  { id: "medical", label: "Medical", angle: -72, dist: 0.44, emergeAt: 0.48 },
  { id: "legal", label: "Legal", angle: -24, dist: 0.4, emergeAt: 0.5 },
  { id: "government", label: "Government", angle: 32, dist: 0.42, emergeAt: 0.52 },
  { id: "callcenter", label: "Call center", angle: 82, dist: 0.38, emergeAt: 0.54 },
  { id: "remote", label: "Remote", angle: 138, dist: 0.46, emergeAt: 0.56 },
];

const PRICING_NODES = PRICING_PLANS.map((plan, i) => ({
  id: plan.key,
  label: plan.name,
  price: plan.priceLabel,
  angle: -55 + i * 55,
  dist: 0.54,
}));

type Props = {
  timeline: CinematicTimeline;
};

export function CinematicNetwork({ timeline }: Props) {
  if (!timeline.visibility.network) return null;
  const { p, networkOpacity, scaleIntensity, pricingIntensity, finaleCollapse } = timeline;
  const cx = 50;
  const cy = 50;
  const collapse = finaleCollapse;

  const nodeScale = 1 - collapse * 0.9;
  const lineOpacity = networkOpacity * (1 - collapse * 0.85);

  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: lineOpacity }}
      aria-hidden
    >
      <defs>
        <radialGradient id="cine-core-glow">
          <stop offset="0%" stopColor="rgba(34,211,238,0.45)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </radialGradient>
        <linearGradient id="cine-comm-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.15)" />
          <stop offset="50%" stopColor="rgba(34,211,238,0.75)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0.15)" />
        </linearGradient>
        <filter id="cine-node-glow">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx={cx} cy={cy} r={20 * nodeScale} fill="url(#cine-core-glow)" opacity={0.55 + scaleIntensity * 0.35} />

      <circle
        cx={cx}
        cy={cy}
        r={3.2 * nodeScale}
        fill="rgba(34,211,238,0.9)"
        filter="url(#cine-node-glow)"
        opacity={0.7 + networkOpacity * 0.3}
      />

      {USE_NODES.map((node) => {
        const emerge = Math.min(1, Math.max(0, (p - node.emergeAt) / 0.07));
        if (emerge <= 0) return null;
        const rad = (node.angle * Math.PI) / 180;
        const dist = node.dist * 38 * nodeScale * emerge;
        const x = cx + Math.cos(rad) * dist;
        const y = cy + Math.sin(rad) * dist;
        const extraNodes = 1 + Math.floor(scaleIntensity * 3);

        return (
          <g key={node.id} opacity={emerge * (1 - collapse)}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="url(#cine-comm-line)" strokeWidth={0.45} />
            <circle cx={x} cy={y} r={2 + scaleIntensity * 0.5} fill="rgba(34,211,238,0.9)" />
            <text x={x} y={y - 3.5} textAnchor="middle" fill="rgba(203,213,225,0.95)" fontSize="2.4" fontWeight="600">
              {node.label}
            </text>
            {extraNodes > 1 &&
              Array.from({ length: extraNodes - 1 }).map((_, j) => {
                const ox = x + (j + 1) * 2.8;
                const oy = y + (j + 1) * 2;
                return (
                  <g key={j}>
                    <line x1={x} y1={y} x2={ox} y2={oy} stroke="rgba(56,189,248,0.25)" strokeWidth="0.25" />
                    <circle cx={ox} cy={oy} r={1} fill="rgba(56,189,248,0.55)" />
                  </g>
                );
              })}
          </g>
        );
      })}

      {pricingIntensity > 0.05 &&
        PRICING_NODES.map((node, i) => {
          const emerge = Math.min(1, Math.max(0, (pricingIntensity - i * 0.12) / 0.4));
          if (emerge <= 0) return null;
          const rad = (node.angle * Math.PI) / 180;
          const dist = node.dist * 44 * nodeScale * emerge;
          const x = cx + Math.cos(rad) * dist;
          const y = cy + Math.sin(rad) * dist;
          const glow = emerge * (1 - collapse);
          return (
            <g key={node.id} opacity={glow}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(34,211,238,0.45)" strokeWidth={0.5} />
              <circle cx={x} cy={y} r={4} fill="none" stroke="rgba(34,211,238,0.65)" strokeWidth="0.45" />
              <circle cx={x} cy={y} r={2.2} fill={`rgba(34,211,238,${0.2 + pricingIntensity * 0.4})`} />
              <text x={x} y={y + 0.6} textAnchor="middle" fill="rgba(241,245,249,0.98)" fontSize="2.1" fontWeight="700">
                {node.price}
              </text>
              <text x={x} y={y - 5} textAnchor="middle" fill="rgba(148,163,184,0.9)" fontSize="1.9">
                {node.label}
              </text>
            </g>
          );
        })}
    </motion.svg>
  );
}
