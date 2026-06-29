import { Link } from "wouter";
import { GlossaryPanel } from "@/components/GlossaryPanel";

export default function GlossaryEditor() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Glossary</h1>
          <Link href="/workspace" className="text-sm text-primary hover:underline">
            Back to workspace
          </Link>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <GlossaryPanel onClose={() => {}} langA="en" langB="es" />
        </div>
      </div>
    </div>
  );
}
