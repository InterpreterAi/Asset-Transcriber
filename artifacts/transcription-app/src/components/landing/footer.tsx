import { Zap } from "lucide-react";

const footerLinks = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#product" },
      { label: "Pricing", href: "#pricing" },
      { label: "Enterprise", href: "#enterprise" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "Medical Interpretation", href: "#solutions" },
      { label: "Legal Interpretation", href: "#solutions" },
      { label: "Insurance", href: "#solutions" },
      { label: "OPI / VRI Workflows", href: "#solutions" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Security & Privacy", href: "/security" },
      { label: "Contact", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-black/30 pt-16 pb-8">
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-14">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-7 w-7 text-primary fill-primary/20" />
              <span className="font-display font-bold text-lg text-white">InterpreterAI</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              The real-time AI infrastructure for professional OPI and VRI interpreters. 62 languages. Sub-second latency. HIPAA compliant.
            </p>
          </div>

          {footerLinks.map((group) => (
            <div key={group.heading}>
              <h4 className="text-xs font-semibold text-white uppercase tracking-widest mb-4">
                {group.heading}
              </h4>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} InterpreterAI. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/refund" className="hover:text-white transition-colors">Refund Policy</a>
            <a href="/security" className="hover:text-white transition-colors">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
