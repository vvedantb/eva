"use client";

import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import { IconGitPullRequest, IconX } from "@tabler/icons-react";
import { prStateIconClass } from "@/lib/components/prStateIconClass";
import { usePendingPullRequests } from "@/lib/contexts/PendingPullRequestsContext";

export function PendingPullRequestChips() {
  const pullRequests = usePendingPullRequests();
  if (!pullRequests || pullRequests.items.length === 0) return null;

  return (
    <div
      className="mb-2 flex flex-wrap gap-1.5"
      data-testid="pull-request-chips"
    >
      {pullRequests.items.map((pr) => {
        const label = `#${pr.number} ${pr.title}`;
        return (
          <Tooltip key={pr.url}>
            <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card py-0.5 pl-2 pr-1 text-xs text-foreground">
              <TooltipTrigger asChild>
                <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                  <IconGitPullRequest
                    className={cn(
                      "size-3.5 shrink-0",
                      prStateIconClass(pr.isDraft ? "draft" : pr.state),
                    )}
                  />
                  <span className="truncate">{label}</span>
                </span>
              </TooltipTrigger>
              <button
                type="button"
                className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                aria-label={`Remove ${label}`}
                onClick={() => pullRequests.remove(pr.url)}
              >
                <IconX className="size-3" />
              </button>
            </span>
            <TooltipContent side="top" className="max-w-80">
              {pr.url}
              {pr.headBranch && pr.baseBranch
                ? ` · ${pr.headBranch} → ${pr.baseBranch}`
                : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
