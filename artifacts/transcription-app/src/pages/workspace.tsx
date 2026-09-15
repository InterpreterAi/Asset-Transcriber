import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { planUsesTrialSonioxX } from "@/experiments/trial-soniox-x/gate";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import TrialSonioxXWorkspace from "@/experiments/trial-soniox-x/TrialSonioxXWorkspace";
import WorkspaceDefault from "./workspace-default";

const LAST_PLAN_KEY = "interpreterai-last-plan-type";

function readLastPlanType(): string | null {
  try {
    return localStorage.getItem(LAST_PLAN_KEY);
  } catch {
    return null;
  }
}

/**
 * Soniox X (Trial / Basic / Professional, plus retired trial-hetzner) uses an isolated official-Soniox live stack.
 * Every other plan keeps workspace-default / use-transcription unchanged.
 */
export default function WorkspacePage() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 15_000 },
  });
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [lastPlanType, setLastPlanType] = useState<string | null>(readLastPlanType);

  useEffect(() => {
    if (!user?.planType) return;
    setLastPlanType(user.planType);
    try {
      localStorage.setItem(LAST_PLAN_KEY, user.planType);
    } catch {
      /* ignore */
    }
  }, [user?.planType]);

  useEffect(() => {
    if (!isLoading) {
      setLoadTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setLoadTimedOut(true), 4_000);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  const planType = user?.planType ?? lastPlanType;

  useEffect(() => {
    if (isLoading && !loadTimedOut) return;
    if (user) return;
    if (planType) return;
    setLocation(loginUrlForReturnTo());
  }, [isLoading, loadTimedOut, user, planType, setLocation]);

  if (isLoading && !loadTimedOut && !planType) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user && !planType) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Redirecting to sign in…
      </div>
    );
  }

  if (planUsesTrialSonioxX(planType)) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <TrialSonioxXWorkspace />
      </div>
    );
  }

  return <WorkspaceDefault />;
}
