import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { planUsesTrialSonioxX } from "@/experiments/trial-soniox-x/gate";
import TrialSonioxXWorkspace from "@/experiments/trial-soniox-x/TrialSonioxXWorkspace";
import WorkspaceDefault from "./workspace-default";

/**
 * Soniox X (Trial / Basic / Professional, plus retired trial-hetzner) uses an isolated official-Soniox live stack.
 * Every other plan keeps workspace-default / use-transcription unchanged.
 */
export default function WorkspacePage() {
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 15_000 },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  if (planUsesTrialSonioxX(user?.planType)) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <TrialSonioxXWorkspace />
      </div>
    );
  }

  return <WorkspaceDefault />;
}
