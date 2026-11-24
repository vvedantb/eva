import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SHELL_VIEWPORT_ROUTE_CLASS } from "@/lib/components/sidebar/shellLayout";
import { cn } from "@eva/ui";

/**
 * Root Projects pages: the cross-repo overview and every project. A project's
 * tasks can span repos, so its page sits outside the repo layout; the URL
 * still names the home repo (`/projects/$owner/$repo/$numId`) so the numId
 * resolves and the page gets its RepoContext.
 */
export const Route = createFileRoute("/projects")({
  beforeLoad: ({ context }) => {
    if (!context.isSignedIn) {
      throw redirect({ to: "/" });
    }
  },
  staticData: { appShell: true, title: "Projects" },
  component: ProjectsLayout,
});

function ProjectsLayout() {
  return (
    // Viewport-bound like the repo shell: boards and the coordinator chat
    // scroll inside themselves.
    <div className={cn("relative flex flex-col", SHELL_VIEWPORT_ROUTE_CLASS)}>
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="vt-page relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
