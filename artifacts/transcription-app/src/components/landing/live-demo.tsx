import { CinematicWorkspace } from "@/components/cinematic-v2/workspace/CinematicWorkspace";

export default function LiveDemo() {
  return (
    <section id="solutions" className="py-24 relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-grid-pattern opacity-50 pointer-events-none" />

      <div className="container px-4 md:px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
            See everything. Miss nothing.
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Experience the same clinical-grade conversation flow shown on login, with the exact EN↔ES script and stable speaker colors.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <CinematicWorkspace />
        </div>
      </div>
    </section>
  );
}
