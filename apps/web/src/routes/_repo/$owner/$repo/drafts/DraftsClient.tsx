"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { CenteredSpinner, motionBase, motionStagger } from "@eva/ui";
import { m } from "motion/react";
import { IconFileText } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { DraftCard } from "./_components/DraftCard";
import { mergeDrafts } from "./_utils";

export function DraftsClient() {
  const { repo, basePath } = useRepo();

  const commentDrafts = useQuery(api.drafts.listForRepo, { repoId: repo._id });
  const taskDrafts = useQuery(api.agentTasks.listDrafts, { repoId: repo._id });

  if (commentDrafts === undefined || taskDrafts === undefined) {
    return (
      <PageWrapper title="Drafts" comfortable>
        <CenteredSpinner label="Loading drafts" className="min-h-80" />
      </PageWrapper>
    );
  }

  const drafts = mergeDrafts(commentDrafts, taskDrafts);

  return (
    <PageWrapper title="Drafts" comfortable fillHeight={drafts.length === 0}>
      {drafts.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={<IconFileText size={24} className="text-muted-foreground" />}
            title="No drafts"
            description="Drafts save automatically as you type comments, prompts, or compose quick tasks."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((model, index) => (
            <m.div
              key={
                model.source === "comment"
                  ? `comment-${model.row._id}`
                  : `task-${model.row._id}`
              }
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...motionBase, delay: motionStagger(index) }}
            >
              <DraftCard model={model} basePath={basePath} />
            </m.div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
