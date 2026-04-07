import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Mic2 } from "lucide-react";

export default function InvitePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const ref = params.get("ref");

    if (ref && /^\d+$/.test(ref)) {
      sessionStorage.setItem("referralCode", ref);

      fetch("/api/referrals/click", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refCode: ref }),
      })
        .then(r => r.json())
        .then((d: { referrerUserId?: number }) => {
          if (d.referrerUserId) sessionStorage.setItem("referralCode", String(d.referrerUserId));
        })
        .catch(() => {});
    }

    const timer = setTimeout(() => setLocation("/signup"), 800);
    return () => clearTimeout(timer);
  }, [search, setLocation]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] gap-4">
      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-border">
        <Mic2 className="w-7 h-7 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">Opening your invitation…</p>
    </div>
  );
}
