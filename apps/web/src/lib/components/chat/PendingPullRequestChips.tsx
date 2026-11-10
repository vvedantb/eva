"use client";

import { cn } from "@eva/ui";
import { IconGitPullRequest } from "@tabler/icons-react";
import {
  PendingContextChip,
  PendingContextChipRow,
} from "@/lib/components/chat/PendingContextChip";
import { prStateIconClass } from "@/lib/components/prStateIconClass";
import { usePendingPullRequests } from "@/lib/contexts/PendingPullRequestsContext";

export function PendingPullRequestChips() {
  const pullRequests = usePendingPullRequests();
  if (!pullRequests || pullRequests.items.length === 0) return null;

  return (
    <PendingContextChipRow testId="pull-request-chips">
      {pullRequests.items.map((pr) => (
        <PendingContextChip
          key={pr.url}
          icon={
            <IconGitPullRequest
              className={cn(
                "size-3.5 shrink-0",
                prStateIconClass(pr.isDraft ? "draft" : pr.state),
              )}
            />
          }
          label={`#${pr.number} ${pr.title}`}
          tooltip={`${pr.url}${
            pr.headBranch && pr.baseBranch
              ? ` · ${pr.headBranch} → ${pr.baseBranch}`
              : ""
          }`}
          onRemove={() => pullRequests.remove(pr.url)}
        />
      ))}
    </PendingContextChipRow>
  );
}
