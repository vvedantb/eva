"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Spinner } from "@eva/ui";
import { TaskDetailInline } from "@/lib/components/tasks/TaskDetailInline";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import type { QuickTaskRouteState } from "../_utils/useQuickTaskRouteState";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { SimpleViewSandboxRedirect } from "@/lib/components/sandbox/SimpleViewSandboxRedirect";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

interface QuickTaskTaskPageContentProps {
  taskId: Id<"agentTasks">;
  routeState: QuickTaskRouteState;
}

export function QuickTaskTaskPageContent({
  taskId,
  routeState,
}: QuickTaskTaskPageContentProps) {
  const navigate = useNavigate();
  const { basePath, repo } = useRepo();
  const simpleView = useSimpleView();
  const params = useParams({ strict: false });
  const pathSegment =
    typeof params.numId === "string" ? params.numId : undefined;

  const tasks = useQuery(api.agentTasks.getAllTasks, { repoId: repo._id });

  const allTags = (() => {
    if (!tasks) return [];
    const tagSet = new Set<string>();
    for (const t of tasks) {
      if (t.tags) {
        for (const tag of t.tags) tagSet.add(tag);
      }
    }
    return [...tagSet].sort();
  })();

  const routing = (() => {
    if (!pathSegment) return undefined;

    if (routeState.surface === "sandbox") {
      const sandboxTab = routeState.sandboxTab;
      return {
        mode: "quick-sandbox" as const,
        quick: {
          sandboxTab,
          onSandboxTabChange: (tab: TaskRouteSandboxTab) => {
            if (tab === "review") {
              void navigate({
                to: toInternalRepoHref(
                  `${basePath}/quick-tasks/${pathSegment}/sandbox/review/diffs/unified`,
                ),
                search: true,
              });
              return;
            }
            void navigate({
              to: toInternalRepoHref(
                `${basePath}/quick-tasks/${pathSegment}/sandbox/${tab}`,
              ),
              // Keep diffFile across sandbox tabs.
              search: true,
            });
          },
          onExitSandboxView: () => {
            navigate({
              to: toInternalRepoHref(`${basePath}/quick-tasks/${pathSegment}`),
              search: (prev) => prev,
            });
          },
          onOpenFile: (path: string) => {
            if (simpleView) return;
            navigate({
              to: toInternalRepoHref(
                `${basePath}/quick-tasks/${pathSegment}/sandbox/files`,
              ),
              search: (prev) => ({ ...prev, file: path }),
            });
          },
          onViewDiff: (repoRelativePath?: string) => {
            if (simpleView) return;
            void navigate({
              to: toInternalRepoHref(
                `${basePath}/quick-tasks/${pathSegment}/sandbox/review/diffs/unified`,
              ),
              search: (prev) => ({
                ...prev,
                ...(repoRelativePath ? { diffFile: repoRelativePath } : {}),
              }),
            });
          },
        },
      };
    }

    const detailTab: TaskDetailTab = routeState.detailTab;
    return {
      mode: "quick-detail" as const,
      quick: {
        detailTab,
        onDetailTabChange: (_tab: TaskDetailTab) => {
          navigate({
            to: toInternalRepoHref(`${basePath}/quick-tasks/${pathSegment}`),
            search: (prev) => prev,
          });
        },
        onOpenSandboxView: (sandboxTab: TaskRouteSandboxTab) => {
          if (sandboxTab === "review") {
            void navigate({
              to: toInternalRepoHref(
                `${basePath}/quick-tasks/${pathSegment}/sandbox/review/diffs/unified`,
              ),
              search: (prev) => prev,
            });
            return;
          }
          void navigate({
            to: toInternalRepoHref(
              `${basePath}/quick-tasks/${pathSegment}/sandbox/${sandboxTab}`,
            ),
            search: (prev) => prev,
          });
        },
      },
    };
  })();

  if (!pathSegment || !routing) {
    return (
      <EntityNotFound
        entityLabel="task"
        backTo={`${basePath}/quick-tasks`}
        backLabel="Back to Quick Tasks"
      />
    );
  }

  if (tasks === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const ownerParam = params.owner;
  const repoParam = params.repo;
  const sandboxTab =
    routeState.surface === "sandbox" ? routeState.sandboxTab : undefined;

  return (
    <>
      {pathSegment &&
      sandboxTab !== undefined &&
      typeof ownerParam === "string" &&
      typeof repoParam === "string" ? (
        <SimpleViewSandboxRedirect
          activeTab={sandboxTab}
          to="/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab"
          params={{
            owner: ownerParam,
            repo: repoParam,
            numId: pathSegment,
          }}
        />
      ) : null}
      <TaskDetailInline
        onClose={() =>
          navigate({
            to: toInternalRepoHref(`${basePath}/quick-tasks`),
            search: (prev) => prev,
          })
        }
        taskId={taskId}
        allTags={allTags}
        routing={routing}
      />
    </>
  );
}
