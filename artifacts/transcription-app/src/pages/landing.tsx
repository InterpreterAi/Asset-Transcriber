import { useEffect } from "react";
import { useLocation } from "wouter";
import { CinematicLanding } from "@/components/cinematic-v2/CinematicLanding";

export default function Landing() {
  const [loc] = useLocation();

  useEffect(() => {
    if ((loc.split("?")[0] || "/") !== "/") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    requestAnimationFrame(() => {
      document.getElementById(raw)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loc]);

  return <CinematicLanding />;
}
