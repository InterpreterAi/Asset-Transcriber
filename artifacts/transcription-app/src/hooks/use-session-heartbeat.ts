import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;

export function useSessionHeartbeat(isAuthenticated: boolean) {
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    const onActivity = () => { lastActivity.current = Date.now(); };
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("keydown",   onActivity, { passive: true });
    window.addEventListener("touchstart",onActivity, { passive: true });
    window.addEventListener("click",     onActivity, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown",   onActivity);
      window.removeEventListener("touchstart",onActivity);
      window.removeEventListener("click",     onActivity);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      const idle = Date.now() - lastActivity.current;
      if (idle > IDLE_THRESHOLD_MS) return;

      try {
        await fetch("/api/auth/heartbeat", {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
        });
      } catch {
        // Heartbeat failures are silent — next interval will retry.
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isAuthenticated]);
}
