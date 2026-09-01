import type { ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";

type Props = {
  children: ReactNode;
  premiumNav?: boolean;
  dark?: boolean;
};

/** Animated shell for all public pages — moving gradients while scrolling. */
export function MarketingPageShell({ children, premiumNav = true, dark = false }: Props) {
  const { scrollYProgress } = useScroll();
  const blob1Y = useTransform(scrollYProgress, [0, 1], [0, 280]);
  const blob2Y = useTransform(scrollYProgress, [0, 1], [0, -220]);
  const blob3X = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);

  return (
    <div
      className={`public-marketing-surface min-h-screen overflow-x-hidden relative ${
        dark ? "bg-[#060B14] text-slate-100" : "bg-[#F8FAFC] text-foreground"
      }`}
    >
      <motion.div
        style={{ y: blob1Y }}
        className="fixed top-[10%] -left-32 w-[min(480px,70vw)] h-[min(480px,70vw)] rounded-full bg-sky-500/[0.08] blur-[100px] pointer-events-none z-0"
        aria-hidden
      />
      <motion.div
        style={{ y: blob2Y }}
        className="fixed top-[45%] -right-24 w-[min(400px,60vw)] h-[min(400px,60vw)] rounded-full bg-violet-500/[0.07] blur-[90px] pointer-events-none z-0"
        aria-hidden
      />
      <motion.div
        style={{ x: blob3X }}
        className="fixed bottom-[8%] left-[30%] w-[min(360px,50vw)] h-[min(360px,50vw)] rounded-full bg-primary/[0.06] blur-[80px] pointer-events-none z-0"
        aria-hidden
      />

      <div className="relative z-10">
        <MarketingNav premium={premiumNav} />
        {children}
        <MarketingFooter dark={dark} />
      </div>
    </div>
  );
}
