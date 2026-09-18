import { useParams, useRouterState } from "@tanstack/react-router";
import type { TaskDetailTab } from "@/lib/components/tasks/_components/task-detail-constants";
import {
  isTaskRouteSandboxTab,
  sandboxTabIdFromParam,
  type TaskRouteSandboxTab,
} from "@/lib/search-params";

export type QuickTaskRouteState =
  | { surface: "detail"; detailTab: TaskDetailTab; sandboxTab?: undefined }
  | {
      surface: "sandbox";
      sandboxTab: TaskRouteSandboxTab;
      detailTab: TaskDetailTab;
    };

const SANDBOX_REVIEW_PATH = /\/sandbox\/review(?:\/|$)/;

/**
 * Reads the active quick-task child segment (detail or sandbox) from the
 * matched route params without remounting the parent layout.
 *
 * Detail lives at `/quick-tasks/$numId` (no tab segment). Sandbox stays at
 * `/quick-tasks/$numId/sandbox/$sandboxTab`, with Review at
 * `/sandbox/review/overview`, `/sandbox/review/diffs/…`, or
 * `/sandbox/review/recap`.
 */
export function useQuickTaskRouteState(): QuickTaskRouteState | null {
  const params = useParams({ strict: false });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (SANDBOX_REVIEW_PATH.test(pathname)) {
    return {
      surface: "sandbox",
      sandboxTab: "review",
      detailTab: "activity",
    };
  }

  const sandboxTab =
    typeof params.sandboxTab === "string"
      ? sandboxTabIdFromParam(params.sandboxTab)
      : params.sandboxTab;
  if (typeof sandboxTab === "string" && isTaskRouteSandboxTab(sandboxTab)) {
    return {
      surface: "sandbox",
      sandboxTab,
      detailTab: "activity",
    };
  }

  // Canonical detail URL has `$numId` and no sandbox/detailTab segment.
  // Legacy `$detailTab` routes redirect away, so treat any open numId as detail.
  if (typeof params.numId === "string") {
    return { surface: "detail", detailTab: "activity" };
  }

  return null;
}
