import { useState, useEffect } from "react";
import { BookOpen, Plus, Trash2, X, ArrowRight, Loader2 } from "lucide-react";
import { readGlossaryStrictEnabled, writeGlossaryStrictEnabled } from "@/lib/glossary-strict-storage";

interface GlossaryEntry {
  id: number;
  term: string;
  translation: string;
  createdAt: string;
}

interface Props {
  onClose: () => void;
}

export function GlossaryPanel({ onClose }: Props) {
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [glossaryStrict, setGlossaryStrict] = useState(() => readGlossaryStrictEnabled());

  const load = async () => {
    try {
      const res = await fetch("/api/glossary", { credentials: "include" });
      const data = await res.json() as { entries?: GlossaryEntry[] };
      if (res.ok) setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !translation.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ term: term.trim(), translation: translation.trim() }),
      });
      const data = await res.json() as { entry?: GlossaryEntry; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setEntries(prev => {
        const idx = prev.findIndex(e => e.id === data.entry!.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.entry!;
          return next;
        }
        return [...prev, data.entry!];
      });
      setTerm("");
      setTranslation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await fetch(`/api/glossary/${id}`, { method: "DELETE", credentials: "include" });
      setEntries(prev => prev.filter(e => e.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full md:w-72 bg-white border-r border-border flex flex-col overflow-hidden shrink-0 z-10">
      <div className="h-[52px] border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">My Glossary</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b border-border/60 bg-muted/20 shrink-0 space-y-2">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Add source phrases and your preferred target wording. The server still nudges the interpreter, then{" "}
          <span className="font-medium text-foreground/80">enforces</span> matches on the final translation (when enabled below). Use commas for
          alternate source phrases, e.g. <span className="font-mono">claim number, claim #</span>. Transcription (STT) is unchanged.
        </p>
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border"
            checked={glossaryStrict}
            onChange={e => {
              const v = e.target.checked;
              setGlossaryStrict(v);
              writeGlossaryStrictEnabled(v);
            }}
          />
          <span className="text-[10px] text-foreground leading-snug">
            <span className="font-semibold">Force glossary on output</span>
            <span className="text-muted-foreground">
              {" "}
              (recommended) — replaces leaks in the translation when possible; if the source matched your term but the preferred wording is missing, it is appended (no extra AI calls).
            </span>
          </span>
        </label>
      </div>

      <form onSubmit={(e) => void handleAdd(e)} className="p-3 border-b border-border/60 shrink-0 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Add Entry</p>
        {error && (
          <p className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1">{error}</p>
        )}
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder='Source term(s), comma-separated'
          className="w-full h-8 px-2.5 text-xs rounded-lg border border-input bg-white outline-none focus:ring-1 focus:ring-ring"
          required
        />
        <input
          value={translation}
          onChange={e => setTranslation(e.target.value)}
          placeholder='Preferred translation (e.g. "رقم المطالبة")'
          className="w-full h-8 px-2.5 text-xs rounded-lg border border-input bg-white outline-none focus:ring-1 focus:ring-ring"
          dir="auto"
          required
        />
        <button
          type="submit"
          disabled={adding || !term.trim() || !translation.trim()}
          className="w-full h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {adding
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Plus className="w-3.5 h-3.5" />}
          {adding ? "Adding…" : "Add Entry"}
        </button>
      </form>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/60">No glossary entries yet</p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">Add your first term above</p>
          </div>
        ) : (
          entries.map(entry => (
            <div
              key={entry.id}
              className="group flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-foreground">{entry.term}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                  <p className="text-[11px] text-muted-foreground truncate" dir="auto">{entry.translation}</p>
                </div>
              </div>
              <button
                onClick={() => void handleDelete(entry.id)}
                disabled={deletingId === entry.id}
                className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0 disabled:opacity-30"
                title="Delete entry"
              >
                {deletingId === entry.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
