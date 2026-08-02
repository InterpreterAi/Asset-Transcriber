import { useCallback, useEffect, useRef, useState } from "react";

export function useCompositionClock(totalMs: number) {
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const baseElapsedRef = useRef(0);
  const rafRef = useRef(0);
  const totalRef = useRef(totalMs);
  totalRef.current = totalMs;

  const tick = useCallback(() => {
    if (startedAtRef.current == null) return;
    const next = baseElapsedRef.current + (performance.now() - startedAtRef.current);
    const total = totalRef.current;
    if (next >= total) {
      setElapsedMs(total);
      setPlaying(false);
      startedAtRef.current = null;
      baseElapsedRef.current = total;
      return;
    }
    setElapsedMs(next);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    startedAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, tick]);

  const play = () => {
    if (elapsedMs >= totalRef.current) {
      baseElapsedRef.current = 0;
      setElapsedMs(0);
    } else {
      baseElapsedRef.current = elapsedMs;
    }
    setPlaying(true);
  };

  const pause = () => {
    if (startedAtRef.current != null) {
      baseElapsedRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    setPlaying(false);
  };

  const seek = (ms: number) => {
    const clamped = Math.max(0, Math.min(totalRef.current, ms));
    baseElapsedRef.current = clamped;
    startedAtRef.current = playing ? performance.now() : null;
    setElapsedMs(clamped);
  };

  const restart = () => {
    baseElapsedRef.current = 0;
    startedAtRef.current = null;
    setElapsedMs(0);
    setPlaying(true);
  };

  return { playing, elapsedMs, totalMs, play, pause, seek, restart, setPlaying };
}
