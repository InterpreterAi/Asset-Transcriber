import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mic, Activity, Globe } from "lucide-react";

const scriptEN = "Good morning, Mr. Reyes. After reviewing your echocardiogram and electrocardiogram, we believe the chest discomfort you've been experiencing may be related to hypertrophic cardiomyopathy. We'd like to schedule a cardiac catheterization.";
const scriptES = "Buenos días, Sr. Reyes. Después de revisar su ecocardiograma y electrocardiograma, creemos que las molestias en el pecho que ha experimentado pueden estar relacionadas con la miocardiopatía hipertrófica. Nos gustaría programar un cateterismo cardíaco.";

export default function LiveDemo() {
  const [displayedEN, setDisplayedEN] = useState("");
  const [displayedES, setDisplayedES] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;

    let currentIndexEN = 0;
    let currentIndexES = 0;
    const wordsEN = scriptEN.split(" ");
    const wordsES = scriptES.split(" ");

    const intervalEN = setInterval(() => {
      if (currentIndexEN < wordsEN.length) {
        setDisplayedEN(prev => prev + (prev ? " " : "") + wordsEN[currentIndexEN]);
        currentIndexEN += 1;
      } else {
        clearInterval(intervalEN);
      }
    }, 150);

    const esDelay = setTimeout(() => {
      const intervalES = setInterval(() => {
        if (currentIndexES < wordsES.length) {
          setDisplayedES(prev => prev + (prev ? " " : "") + wordsES[currentIndexES]);
          currentIndexES += 1;
        } else {
          clearInterval(intervalES);
          setIsDone(true);
        }
      }, 140);
    }, 800);

    return () => {
      clearInterval(intervalEN);
      clearTimeout(esDelay);
    };
  }, [isPlaying]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isPlaying && !isDone) {
          setIsPlaying(true);
        }
      },
      { threshold: 0.5 },
    );

    const el = document.getElementById("demo-workspace");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [isPlaying, isDone]);

  const resetDemo = () => {
    setDisplayedEN("");
    setDisplayedES("");
    setIsDone(false);
    setIsPlaying(false);
    setTimeout(() => setIsPlaying(true), 100);
  };

  return (
    <section id="solutions" className="py-24 relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-grid-pattern opacity-50 pointer-events-none" />

      <div className="container px-4 md:px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
            See everything. Miss nothing.
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Experience the <span className="text-primary font-medium">sub-second latency</span> that allows professional interpreters to perform without taking a single note.
          </p>
        </div>

        <div
          id="demo-workspace"
          className="max-w-5xl mx-auto rounded-xl border border-border bg-[#05080E] shadow-2xl overflow-hidden shadow-[0_0_50px_rgba(0,123,255,0.1)] relative"
        >
          <div className="h-12 border-b border-border bg-[#0A0E17] flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="flex items-center gap-1"><Mic className="h-3 w-3 text-red-400 animate-pulse" /> Live</span>
                <span>•</span>
                <span>Session ID: M-8492</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-border text-xs text-white font-mono">
                <Activity className="h-3 w-3 text-primary" /> Latency: 0.8s
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row h-[400px]">
            <div className="flex-1 border-r border-border p-6 flex flex-col relative bg-[#05080E]">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-md bg-white/5 border border-border flex items-center justify-center">
                  <Globe className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">English (US)</div>
                  <div className="text-xs text-muted-foreground">Original Audio</div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-4 font-sans text-lg text-white leading-relaxed tracking-wide">
                <p>
                  <span className="text-primary/70 font-semibold text-sm block mb-1">Clinician</span>
                  {displayedEN}
                  {isPlaying && !isDone && <span className="inline-block w-1.5 h-5 ml-1 bg-white/80 animate-pulse" />}
                </p>
              </div>
            </div>

            <div className="flex-1 p-6 flex flex-col relative bg-[#030508]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-primary">Spanish (Latin America)</div>
                    <div className="text-xs text-primary/60">Live Translation</div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-4 font-sans text-lg text-[#CAD5E2] leading-relaxed tracking-wide">
                <p>
                  <span className="text-primary/50 font-semibold text-sm block mb-1">Translated</span>
                  {displayedES}
                  {isPlaying && !isDone && displayedEN.length > 20 && <span className="inline-block w-1.5 h-5 ml-1 bg-primary/80 animate-pulse" />}
                </p>
              </div>
            </div>
          </div>

          {isDone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2"
            >
              <button
                onClick={resetDemo}
                className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs text-white backdrop-blur border border-white/10 transition-colors"
              >
                Replay Scenario
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
