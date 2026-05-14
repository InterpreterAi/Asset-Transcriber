import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Zap } from "lucide-react";

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 min-w-0 shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
      <div
        className={`rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 ${compact ? "w-8 h-8" : "w-9 h-9"}`}
      >
        <Zap className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} strokeWidth={2.2} />
      </div>
      <span
        className={`font-semibold tracking-tight text-foreground ${compact ? "text-[15px]" : "text-[17px]"}`}
      >
        Interpreter<span className="text-primary">AI</span>
      </span>
    </Link>
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function MarketingNav() {
  const [loc, setLoc] = useLocation();
  const path = (loc.split("?")[0] ?? "/") || "/";
  const [open, setOpen] = useState(false);

  const goHomeSection = (id: string) => {
    setOpen(false);
    if (path === "/" || path === "") {
      scrollToSection(id);
    } else {
      setLoc("/");
      window.setTimeout(() => scrollToSection(id), 120);
    }
  };

  const linkCls =
    "text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

  return (
    <header className="sticky top-0 z-50 marketing-nav-glass">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <BrandWordmark />

        <nav className="hidden lg:flex items-center gap-8" aria-label="Primary">
          <button type="button" className={linkCls} onClick={() => goHomeSection("product")}>
            Product
          </button>
          <button type="button" className={linkCls} onClick={() => goHomeSection("solutions")}>
            Solutions
          </button>
          <Link href="/security" className={linkCls}>
            Security
          </Link>
          <Link href="/privacy" className={linkCls}>
            Privacy
          </Link>
          <button type="button" className={linkCls} onClick={() => goHomeSection("enterprise")}>
            Enterprise
          </button>
          <Link href="/pricing" className={linkCls}>
            Pricing
          </Link>
        </nav>

        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <Link
            href="/login"
            className="text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="text-[14px] font-semibold text-primary-foreground bg-primary hover:bg-[#1D4ED8] px-4 py-2.5 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-px outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
          >
            Start Free Trial
          </Link>
        </div>

        <button
          type="button"
          className="lg:hidden p-2 rounded-lg text-foreground hover:bg-muted/80 transition-colors"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border/60 bg-white/95 backdrop-blur-md px-4 py-5 flex flex-col gap-1 shadow-lg">
          <button type="button" className={`${linkCls} text-left py-3 px-2`} onClick={() => goHomeSection("product")}>
            Product
          </button>
          <button type="button" className={`${linkCls} text-left py-3 px-2`} onClick={() => goHomeSection("solutions")}>
            Solutions
          </button>
          <Link href="/security" className={`${linkCls} py-3 px-2 block`} onClick={() => setOpen(false)}>
            Security
          </Link>
          <Link href="/privacy" className={`${linkCls} py-3 px-2 block`} onClick={() => setOpen(false)}>
            Privacy
          </Link>
          <button type="button" className={`${linkCls} text-left py-3 px-2`} onClick={() => goHomeSection("enterprise")}>
            Enterprise
          </button>
          <Link href="/pricing" className={`${linkCls} py-3 px-2 block`} onClick={() => setOpen(false)}>
            Pricing
          </Link>
          <hr className="border-border my-2" />
          <Link href="/login" className={`${linkCls} py-3 px-2 block`} onClick={() => setOpen(false)}>
            Login
          </Link>
          <Link
            href="/signup"
            className="mt-2 text-center text-[14px] font-semibold text-primary-foreground bg-primary py-3 rounded-xl shadow-sm"
            onClick={() => setOpen(false)}
          >
            Start Free Trial
          </Link>
        </div>
      )}
    </header>
  );
}

export { BrandWordmark };
