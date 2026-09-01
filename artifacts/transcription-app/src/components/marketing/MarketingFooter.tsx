import { Link } from "wouter";
import { Mic2 } from "lucide-react";

export function MarketingFooter({ dark = false }: { dark?: boolean }) {
  const heading = dark ? "text-white" : "text-foreground";
  const muted = dark ? "text-slate-400" : "text-muted-foreground";
  const hover = dark ? "hover:text-white" : "hover:text-foreground";
  const hairline = dark ? "border-white/10" : "border-border";

  return (
    <footer className={`border-t ${hairline} ${dark ? "bg-[#060B14]" : "bg-white"}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10">
          <div className="max-w-sm">
            <div className={`flex items-center gap-2 font-semibold text-lg tracking-tight ${heading}`}>
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${dark ? "bg-cyan-400/10 text-cyan-300" : "bg-primary/10 text-primary"}`}>
                <Mic2 className="w-4 h-4" />
              </span>
              InterpreterAI
            </div>
            <p className={`mt-3 text-sm leading-relaxed ${muted}`}>
              Professional infrastructure for real-time interpreter support across OPI and VRI workflows.
            </p>
            <p className={`mt-3 text-sm ${muted}`}>
              Support:{" "}
              <a href="mailto:support@interpreterai.com" className={`${hover} underline underline-offset-2`}>
                support@interpreterai.com
              </a>
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 text-sm">
            <div>
              <p className={`font-semibold mb-3 ${heading}`}>Product</p>
              <ul className={`space-y-2 ${muted}`}>
                <li>
                  <Link href="/#product" className={`${hover} transition-colors`}>
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className={`${hover} transition-colors`}>
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/#enterprise" className={`${hover} transition-colors`}>
                    Enterprise
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className={`font-semibold mb-3 ${heading}`}>Trust</p>
              <ul className={`space-y-2 ${muted}`}>
                <li>
                  <Link href="/security" className={`${hover} transition-colors`}>
                    Security &amp; Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className={`${hover} transition-colors`}>
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className={`${hover} transition-colors`}>
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/refund" className={`${hover} transition-colors`}>
                    Refund Policy
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className={`font-semibold mb-3 ${heading}`}>Account</p>
              <ul className={`space-y-2 ${muted}`}>
                <li>
                  <Link href="/login" className={`${hover} transition-colors`}>
                    Login
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className={`${hover} transition-colors`}>
                    Start trial
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className={`mt-12 pt-8 border-t ${hairline} flex flex-col sm:flex-row items-center justify-between gap-4 text-sm ${muted}`}>
          <span>© {new Date().getFullYear()} InterpreterAI · All rights reserved</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className={`${hover} transition-colors`}>
              Privacy
            </Link>
            <Link href="/terms" className={`${hover} transition-colors`}>
              Terms
            </Link>
            <Link href="/refund" className={`${hover} transition-colors`}>
              Refunds
            </Link>
            <Link href="/security" className={`${hover} transition-colors`}>
              Security
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
