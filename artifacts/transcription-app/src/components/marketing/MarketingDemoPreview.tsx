import {
  Mic2, ArrowRight, Clock, Globe, BookOpen,
  Languages, StickyNote, BookMarked, Search, Stethoscope, History,
} from "lucide-react";

function SpeakerBadge({ n, color }: { n: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border mb-1 ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${n === 1 ? "bg-[#3B82F6]" : "bg-[#1D4ED8]"}`} />
      Speaker {n}
    </span>
  );
}

function DemoRow({
  speaker,
  orig,
  trans,
  dir: textDir = "ltr",
  highlight = false,
  live = false,
}: {
  speaker: number;
  orig: string;
  trans?: string;
  dir?: "ltr" | "rtl";
  highlight?: boolean;
  live?: boolean;
}) {
  const spColor = speaker === 1
    ? "bg-blue-50/80 text-blue-800 border-blue-200/80"
    : "bg-slate-50 text-slate-800 border-slate-200";

  return (
    <div className={`grid grid-cols-2 gap-4 px-3 py-2 rounded-lg ${highlight ? "bg-[#EFF6FF]/90 border-l-2 border-primary" : ""}`}>
      <div className="flex flex-col">
        <SpeakerBadge n={speaker} color={spColor} />
        <p className="text-[12px] leading-snug text-foreground font-medium">
          {orig}
          {live && <span className="inline-block w-[2px] h-[13px] bg-primary ml-1 animate-pulse align-middle rounded-sm" />}
        </p>
      </div>
      <div className="flex flex-col">
        <span className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border mb-1 bg-emerald-50/90 text-emerald-800 border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
          Live assist
        </span>
        {trans ? (
          <p className="text-[12px] leading-snug text-foreground/90 font-medium" dir={textDir}>{trans}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground/60 italic flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-primary/40 animate-pulse" />
            Processing…
          </p>
        )}
      </div>
    </div>
  );
}

function BrandMini() {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="w-5 h-5 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Mic2 className="w-3 h-3" />
      </div>
      <span className="text-[12px] font-semibold tracking-tight text-foreground whitespace-nowrap">
        Interpreter<span className="text-primary">AI</span>
      </span>
    </div>
  );
}

/** Static product preview for marketing — not connected to live sessions. */
export function MarketingDemoPreview() {
  return (
    <div className="relative w-full max-w-5xl mx-auto select-none">
      <div className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-b from-primary/[0.07] to-transparent blur-3xl scale-95 translate-y-8" />
      <div className="bg-white rounded-[20px] border border-border/80 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.2)] overflow-hidden ring-1 ring-black/[0.04]">
        <div className="h-[46px] bg-white border-b border-border/80 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex gap-1.5 shrink-0">
              <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <div className="w-3 h-3 rounded-full bg-[#FFBC2E]" />
              <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            </div>
            <BrandMini />
            <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/15">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              English ↔ Spanish
            </span>
            <span className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground bg-muted/30 border border-border/50">
              <Clock className="w-2.5 h-2.5" />
              03:47
            </span>
          </div>
        </div>

        <div className="flex" style={{ height: "420px" }}>
          <div className="w-[48px] bg-slate-50 border-r border-border/80 flex flex-col items-center pt-3 pb-2 gap-1.5 shrink-0">
            {[{ Icon: Mic2, active: true }, { Icon: Globe, active: false }, { Icon: BookOpen, active: false }].map(({ Icon, active }, i) => (
              <div key={i} className={`w-8 h-8 rounded-xl flex items-center justify-center ${active ? "bg-white shadow-sm text-primary ring-1 ring-border/60" : "text-muted-foreground/30"}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            ))}
          </div>

          <div className="w-[175px] shrink-0 flex flex-col gap-2 p-2 bg-slate-50/80 border-r border-border/80 overflow-hidden">
            <div className="bg-white rounded-xl border border-border/70 shadow-sm flex flex-col overflow-hidden h-[20%]">
              <div className="h-8 border-b border-border/60 bg-muted/10 flex items-center gap-1.5 px-2.5 shrink-0">
                <StickyNote className="w-3 h-3 text-amber-600 shrink-0" />
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
              </div>
              <div className="flex-1 px-2.5 py-1.5 overflow-hidden">
                <p className="text-[10px] text-foreground/70 leading-relaxed">
                  Ref #: 4421
                  <br />
                  Session notes
                  <br />
                  <span className="text-muted-foreground/50 italic text-[9px]">Cleared when session ends</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/70 shadow-sm flex flex-col overflow-hidden h-[44%]">
              <div className="h-8 border-b border-border/60 bg-muted/10 flex items-center gap-1.5 px-2.5 shrink-0">
                <BookMarked className="w-3 h-3 text-primary shrink-0" />
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">Terminology</span>
                <span className="text-[8px] text-muted-foreground/50 font-mono">EN→ES</span>
              </div>
              <div className="px-2 py-1.5 border-b border-border/40 shrink-0">
                <div className="flex items-center h-6 rounded-md border border-primary/25 bg-white px-2 gap-1 ring-1 ring-primary/10">
                  <Search className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                  <span className="text-[10px] text-foreground/80">manguito rotador</span>
                </div>
              </div>
              <div className="flex-1 p-1.5 space-y-1 overflow-hidden">
                <div className="rounded-lg border border-border/50 bg-slate-50/50 px-2 py-1.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-semibold text-foreground">manguito rotador</span>
                    <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
                    <span className="text-[10px] font-semibold text-primary">rotator cuff</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold border bg-blue-50 text-blue-700 border-blue-200/80">
                      <Stethoscope className="w-2 h-2" />
                      Medical
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-slate-50/50 px-2 py-1.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-semibold text-foreground">demandante</span>
                    <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
                    <span className="text-[10px] font-semibold text-primary">plaintiff</span>
                  </div>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold border bg-slate-100 text-slate-700 border-slate-200 mt-1">
                    Legal
                  </span>
                </div>
                <p className="text-[7.5px] text-muted-foreground/40 text-center">Reference support</p>
              </div>
            </div>

            <div className="flex-1 bg-white rounded-xl border border-border/70 shadow-sm flex flex-col overflow-hidden min-h-0">
              <div className="h-8 border-b border-border/60 bg-muted/10 flex items-center gap-1.5 px-2.5 shrink-0">
                <History className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">Sessions</span>
              </div>
              <div className="flex border-b border-border/50 shrink-0">
                {["Today", "Week", "Month", "All"].map((tab, i) => (
                  <div key={tab} className={`flex-1 py-1 text-center text-[8.5px] font-semibold ${i === 0 ? "text-primary border-b-2 border-primary bg-primary/[0.06]" : "text-muted-foreground/50"}`}>
                    {tab}
                  </div>
                ))}
              </div>
              <div className="px-2 py-1.5 space-y-1.5 overflow-hidden">
                <div className="flex gap-1">
                  {[
                    { v: "5", l: "Sessions", cls: "bg-blue-50 text-blue-700" },
                    { v: "47m", l: "Total", cls: "bg-slate-100 text-slate-700" },
                    { v: "9m", l: "Avg", cls: "bg-emerald-50 text-emerald-700" },
                  ].map(({ v, l, cls }) => (
                    <div key={l} className={`flex-1 rounded-md py-1 text-center ${cls}`}>
                      <p className="text-[11px] font-bold leading-none">{v}</p>
                      <p className="text-[7.5px] mt-0.5 opacity-90">{l}</p>
                    </div>
                  ))}
                </div>
                {[{ time: "2:18 PM", dur: "12m", pair: "EN↔ES" }, { time: "11:05 AM", dur: "9m", pair: "EN↔ES" }].map(({ time, dur, pair }) => (
                  <div key={time} className="flex items-center justify-between rounded-md bg-muted/15 border border-border/40 px-2 py-1">
                    <span className="text-[9px] text-muted-foreground">{time}</span>
                    <span className="text-[9px] font-semibold text-foreground">{dur}</span>
                    <span className="text-[8px] text-primary/80 font-mono">{pair}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-9 border-b border-border/80 bg-muted/10 flex items-center justify-between px-4 shrink-0">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Live output</span>
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-[9px] text-muted-foreground/50">Real-time processing</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Active
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 px-3 py-1.5 border-b border-border/40 bg-slate-50/50 shrink-0">
              <span className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Original</span>
              <span className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Assist column</span>
            </div>
            <div className="flex-1 overflow-hidden py-2 px-1 space-y-1">
              <DemoRow speaker={1} orig="Good morning, how can I help you today?" trans="Buenos días, ¿cómo puedo ayudarle hoy?" />
              <DemoRow speaker={2} orig="I need to schedule a follow-up appointment." trans="Necesito programar una cita de seguimiento." />
              <DemoRow speaker={1} orig="The rotator cuff requires physical therapy." trans="El manguito rotador requiere fisioterapia." highlight />
              <DemoRow speaker={2} orig="Can I see a specialist this week" live />
            </div>
          </div>
        </div>

        <div className="h-[46px] border-t border-border/80 bg-white flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse" />
              Stop
            </div>
            <div className="h-8 px-2.5 rounded-lg border border-border text-[11px] text-muted-foreground flex items-center gap-1.5 bg-muted/20">
              <Mic2 className="w-3 h-3" />
              <span className="hidden sm:inline">Microphone</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Languages className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">English ↔ Spanish</span>
            <div className="flex items-center gap-1 bg-muted/40 px-2 py-1 rounded-full border border-border/50 font-medium">
              <Clock className="w-3 h-3" />
              3.8 min
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
