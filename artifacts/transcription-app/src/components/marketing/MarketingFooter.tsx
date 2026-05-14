import { Link } from "wouter";
import { Mic2 } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 text-foreground font-semibold text-lg tracking-tight">
              <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Mic2 className="w-4 h-4" />
              </span>
              InterpreterAI
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Professional infrastructure for real-time interpreter support across OPI and VRI workflows.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 text-sm">
            <div>
              <p className="font-semibold text-foreground mb-3">Product</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <Link href="/#product" className="hover:text-foreground transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/#enterprise" className="hover:text-foreground transition-colors">
                    Enterprise
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-3">Trust</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <Link href="/security" className="hover:text-foreground transition-colors">
                    Security
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-foreground transition-colors">
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-3">Account</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <Link href="/login" className="hover:text-foreground transition-colors">
                    Login
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="hover:text-foreground transition-colors">
                    Start trial
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} InterpreterAI · All rights reserved</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/security" className="hover:text-foreground transition-colors">
              Security
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
