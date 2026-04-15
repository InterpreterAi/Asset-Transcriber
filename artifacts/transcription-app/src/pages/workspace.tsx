import { useGetMe } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import WorkspaceDefault from "./workspace-default";
import WorkspaceMorsy from "./workspace-morsy";

/**
 * Routes to the April 13 baseline transcription hook only for admins on `morsy-basic`.
 * All other users (including non-admins incorrectly assigned `morsy-basic`) use the
 * current production workspace so hooks stay valid and behavior stays predictable.
 */
export default function Workspace() {
  const { data: user, isLoading: userLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return null;

  if (user.planType === "morsy-basic" && user.isAdmin) {
    return <WorkspaceMorsy />;
  }
  return <WorkspaceDefault />;
}
