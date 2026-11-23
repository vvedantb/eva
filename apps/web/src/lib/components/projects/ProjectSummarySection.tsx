"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import type { ProjectStatus } from "@eva/shared/projectStatus";
import { Markdown } from "@vvedantb/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { sessionSourceViewAllClass } from "@/lib/components/sandbox/SessionSourcePane";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { ProjectProgressBar } from "./ProjectProgressBar";
import { ProjectStageCounts } from "./ProjectStageCounts";

/**
 * The Overview's status block: live task counts and progress (derived, so
 * never stale), then the coordinator's summary doc. The doc can lag between
 * coordinator turns; the counts above it cannot.
 */
export function ProjectSummarySection({
  projectId,
  status,
  documentsHref,
}: {
  projectId: Id<"projects">;
  status: ProjectStatus | undefined;
  /** The project's Documents tab (pre-internal path), or undefined without a numId. */
  documentsHref: string | undefined;
}) {
  const summaryDoc = useQuery(api.projects.getSummaryDoc, { projectId });
  const navigate = useNavigate();
  return (
    <section className="space-y-3">
      <ProjectStageCounts status={status} />
      <ProjectProgressBar status={status} />
      {summaryDoc ? (
        <div className="space-y-2 rounded-surface bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="truncate text-2sm font-medium tracking-[-0.01em] text-foreground">
              {summaryDoc.title}
            </h2>
            {documentsHref ? (
              // design-check-ignore-next-line — same "View all" chip as SessionSourcePane
              <button
                type="button"
                className={sessionSourceViewAllClass}
                onClick={() =>
                  void navigate({
                    to: toInternalRepoHref(documentsHref),
                    search: (prev) => ({ ...prev, panelItem: summaryDoc._id }),
                  })
                }
              >
                Open
                <IconArrowUpRight size={14} />
              </button>
            ) : null}
          </div>
          <Markdown className="prose prose-sm dark:prose-invert max-w-none">
            {summaryDoc.content}
          </Markdown>
        </div>
      ) : null}
    </section>
  );
}
