import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LiveCursors } from "@/lib/components/LiveCursors";
import { RepoGate, RepoProvider } from "@/lib/contexts/RepoContext";
import { IS_EMBEDDED } from "@/lib/embed/embedded";

/** A project's home repo: the RepoContext its page reads (as `_repo/$owner/$repo`). */
export const Route = createFileRoute("/projects/$owner/$repo")({
  component: ProjectRepoLayout,
});

function ProjectRepoLayout() {
  const { owner, repo } = Route.useParams();
  return (
    <RepoProvider owner={owner} repoParam={repo}>
      <RepoGate>
        <Outlet />
      </RepoGate>
      {/* The host window already draws cursors; a second layer would double them. */}
      {IS_EMBEDDED ? null : <LiveCursors />}
    </RepoProvider>
  );
}
