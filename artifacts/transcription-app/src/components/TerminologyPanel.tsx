import { useState, useEffect, useRef } from "react";
import { Search, BookMarked, Loader2, ArrowRight, AlertCircle, Stethoscope, Scale, Globe2 } from "lucide-react";

interface TermResult {
  source: string;
  translation: string;
  domain: "medical" | "legal" | "general";
  note: string;
}

interface Props {
  langA: string;
  langB: string;
}

const LANG_NAMES: Record<string, string> = {
  en: "English", ar: "Arabic", es: "Spanish", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", ru: "Russian", ja: "Japanese", ko: "Korean",
  hi: "Hindi", fa: "Persian", he: "Hebrew", tr: "Turkish", pl: "Polish",
  nl: "Dutch", sv: "Swedish", da: "Danish", fi: "Finnish", cs: "Czech",
  hu: "Hungarian", ro: "Romanian", bg: "Bulgarian", hr: "Croatian", sk: "Slovak",
  uk: "Ukrainian", ur: "Urdu", vi: "Vietnamese", th: "Thai", ms: "Malay",
  id: "Indonesian", el: "Greek", nb: "Norwegian", "zh-CN": "Chinese", "zh-TW": "Chinese (Trad.)",
};

function langShort(code: string): string {
  return LANG_NAMES[code] ?? code;
}

const DOMAIN_STYLES: Record<string, { label: string; icon: React.ReactNode; pill: string }> = {
  medical: {
    label: "Medical",
    icon: <Stethoscope className="w-2.5 h-2.5" />,
    pill: "bg-blue-50 text-blue-600 border-blue-200",
  },
  legal: {
    label: "Legal",
    icon: <Scale className="w-2.5 h-2.5" />,
    pill: "bg-amber-50 text-amber-700 border-amber-200",
  },
  general: {
    label: "General",
    icon: <Globe2 className="w-2.5 h-2.5" />,
    pill: "bg-muted text-muted-foreground border-border",
  },
};

const EXAMPLE_TERMS = ["rotator cuff", "plaintiff", "myocardial", "deposition", "hypertension"];

export function TerminologyPanel({ langA, langB }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TermResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/terminology/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ term: term.trim(), sourceLang: langA, targetLang: langB }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Lookup failed");
      }

      const data = await res.json() as { results: TermResult[] };
      setResults(data.results ?? []);
      setSearched(true);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Lookup unavailable — check connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      setError(null);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    debounceRef.current = setTimeout(() => void search(query), 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, langA, langB]);

  return (
    <div className="h-full bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden">

      {/* Header */}
      <div className="h-10 border-b border-border bg-muted/20 flex items-center gap-2 px-3 shrink-0">
        <BookMarked className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Terminology
        </span>
        <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0 hidden sm:block">
          {langShort(langA)} → {langShort(langB)}
        </span>
      </div>

      {/* Search input */}
      <div className="px-2.5 py-2 border-b border-border/50 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search a term…"
            className="w-full h-7 pl-6 pr-2 text-[11px] rounded-lg border border-input bg-muted/30 outline-none focus:ring-1 focus:ring-ring focus:bg-white transition-colors placeholder:text-muted-foreground/40"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground/50" />
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="flex items-start gap-2 px-3 py-3 text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed">{error}</p>
          </div>
        )}

        {!error && !loading && searched && results.length === 0 && (
          <div className="py-6 px-3 text-center">
            <p className="text-[10px] text-muted-foreground/60">No results found for</p>
            <p className="text-[11px] font-medium text-foreground mt-0.5 italic">"{query}"</p>
            <p className="text-[10px] text-muted-foreground/40 mt-2">Try a different spelling or a related term.</p>
          </div>
        )}

        {!error && !loading && !searched && !query && (
          <div className="px-3 py-3">
            <p className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-2">Try searching</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_TERMS.map(term => (
                <button
                  key={term}
                  onClick={() => setQuery(term)}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground/35 mt-3 leading-relaxed">
              Reference only · No data stored
            </p>
          </div>
        )}

        {!error && results.length > 0 && (
          <div className="p-2 space-y-1.5">
            {results.map((r, i) => {
              const domainStyle = DOMAIN_STYLES[r.domain] ?? DOMAIN_STYLES.general;
              return (
                <div
                  key={i}
                  className="rounded-lg border border-border/60 bg-muted/10 px-2.5 py-2 hover:bg-muted/20 transition-colors"
                >
                  {/* Source → Translation row */}
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-foreground leading-snug">{r.source}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-semibold text-primary leading-snug" dir="auto">{r.translation}</span>
                  </div>

                  {/* Domain + note row */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${domainStyle.pill}`}>
                      {domainStyle.icon}
                      {domainStyle.label}
                    </span>
                    {r.note && (
                      <span className="text-[9px] text-muted-foreground/60 leading-relaxed">{r.note}</span>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-[8.5px] text-muted-foreground/30 text-center pt-1 pb-0.5">
              Reference only · Not stored · Verify with authoritative sources
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
