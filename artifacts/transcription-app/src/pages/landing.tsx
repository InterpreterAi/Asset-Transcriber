import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic2, Globe, Zap, Shield, ChevronRight } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-foreground">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <Mic2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-[17px] tracking-tight">InterpreterAI</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/terms")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms
          </button>
          <button
            onClick={() => setLocation("/privacy")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy
          </button>
          <button
            onClick={() => setLocation("/login")}
            className="text-sm font-medium px-4 py-1.5 rounded-lg border border-border bg-white hover:bg-muted/40 transition-colors"
          >
            Log In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold border border-violet-200 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            Real-time AI Transcription & Translation
          </div>

          <h1 className="text-5xl sm:text-6xl font-display font-bold tracking-tight text-foreground mb-6 leading-tight">
            AI Assistant for<br />
            <span className="text-primary">Interpreters</span>
          </h1>

          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Real-time transcription and translation during live calls.<br />
            Built for professional interpreters who demand accuracy.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => setLocation("/signup")}
              className="flex items-center gap-2 px-8 py-3.5 bg-primary text-white rounded-full font-semibold text-[15px] shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
            >
              Start Free Trial
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="flex items-center gap-2 px-8 py-3.5 bg-white text-foreground rounded-full font-semibold text-[15px] border border-border shadow-sm hover:bg-muted/40 active:scale-95 transition-all"
            >
              Log In
            </button>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            14-day free trial · No credit card required
          </p>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-6"
        >
          {[
            {
              icon: <Zap className="w-5 h-5 text-violet-600" />,
              title: "Real-time Streaming",
              desc: "Sub-second transcription with live speaker diarization. Every word, instantly.",
            },
            {
              icon: <Globe className="w-5 h-5 text-blue-600" />,
              title: "Bidirectional Translation",
              desc: "Auto-detect language and translate in both directions simultaneously. 30+ languages.",
            },
            {
              icon: <Shield className="w-5 h-5 text-green-600" />,
              title: "Professional Grade",
              desc: "Interpreter-certified terminology, domain glossaries, and Modern Standard Arabic support.",
            },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-border p-6 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
                {icon}
              </div>
              <h3 className="font-semibold text-[15px] mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-3xl font-display font-bold text-center mb-12 tracking-tight">
          Simple, transparent pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              name: "Basic",
              price: "$40",
              limit: "5 hours / day",
              features: ["Real-time transcription", "Bidirectional translation", "Speaker diarization", "30+ languages"],
              highlight: false,
            },
            {
              name: "Professional",
              price: "$80",
              limit: "7 hours / day",
              features: ["Everything in Basic", "Priority processing", "Translation memory", "Domain glossaries"],
              highlight: true,
            },
            {
              name: "Unlimited",
              price: "$120",
              limit: "Unlimited",
              features: ["Everything in Professional", "Tab audio capture", "API access", "Dedicated support"],
              highlight: false,
            },
          ].map(({ name, price, limit, features, highlight }) => (
            <div
              key={name}
              className={`rounded-2xl border p-6 shadow-sm ${
                highlight
                  ? "border-primary bg-primary text-white shadow-lg"
                  : "border-border bg-white"
              }`}
            >
              {highlight && (
                <div className="text-xs font-bold uppercase tracking-wider text-white/70 mb-3">
                  Most Popular
                </div>
              )}
              <div className={`text-sm font-semibold mb-1 ${highlight ? "text-white/80" : "text-muted-foreground"}`}>
                {name}
              </div>
              <div className={`text-4xl font-display font-bold mb-1 ${highlight ? "text-white" : "text-foreground"}`}>
                {price}
                <span className={`text-base font-normal ml-1 ${highlight ? "text-white/70" : "text-muted-foreground"}`}>/mo</span>
              </div>
              <div className={`text-sm mb-6 ${highlight ? "text-white/70" : "text-muted-foreground"}`}>
                {limit}
              </div>
              <ul className="space-y-2 mb-6">
                {features.map((f) => (
                  <li key={f} className={`text-sm flex items-center gap-2 ${highlight ? "text-white/90" : "text-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${highlight ? "bg-white/60" : "bg-primary"}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setLocation("/signup")}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  highlight
                    ? "bg-white text-primary hover:bg-white/90"
                    : "bg-primary text-white hover:bg-primary/90"
                }`}
              >
                Start Free Trial
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mic2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">© 2026 InterpreterAI</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => setLocation("/terms")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </button>
            <button onClick={() => setLocation("/privacy")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
