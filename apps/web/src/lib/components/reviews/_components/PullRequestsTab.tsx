"use client";

import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { Badge, LIST_ROW_CONTROL_CLASS, ListRow, cn } from "@eva/ui";
import { IconExternalLink, IconGitPullRequest } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { prStateIconClass } from "@/lib/components/prStateIconClass";

export type ReviewPullRequest = FunctionReturnType<
  typeof api.pullRequests.listForOwner
>[number];

const STATE_LABEL: Record<ReviewPullRequest["state"], string> = {
  draft: "Draft",
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

/**
 * The Pull requests tab: every PR the session, quick task or project holds —
 * the one Eva opened, each linked repo's, and any the agent opened on a side
 * branch. Picking one points Summary, Timeline and Code at it. Rows reuse the
 * sidebar Reviews row's layout (state-coloured icon, title, then number and
 * age) so a PR reads the same in both places.
 */
export function PullRequestsTab({
  items,
  selectedId,
  onSelect,
}: {
  items: readonly ReviewPullRequest[];
  selectedId: Id<"pullRequests"> | undefined;
  onSelect: (id: Id<"pullRequests">) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconGitPullRequest className="h-10 w-10 text-muted-foreground/60" />
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">No pull request yet</p>
          <p className="text-sm text-muted-foreground">
            Once a pull request is opened for this work, it will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <ul className="mx-auto flex max-w-3xl flex-col gap-1.5 p-4">
        {items.map((pr) => (
          <li key={pr._id}>
            <PullRequestRow
              pr={pr}
              selected={pr._id === selectedId}
              onSelect={() => onSelect(pr._id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PullRequestRow({
  pr,
  selected,
  onSelect,
}: {
  pr: ReviewPullRequest;
  selected: boolean;
  onSelect: () => void;
}) {
  const title = pr.title ?? `Pull request #${pr.prNumber}`;
  return (
    <ListRow
      selected={selected}
      onClick={onSelect}
      aria-label={`Review #${pr.prNumber} ${title}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <IconGitPullRequest
          size={14}
          className={cn("mt-0.5 shrink-0", prStateIconClass(pr.state))}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{title}</span>
            {pr.primary ? (
              <Badge variant="outline" className="shrink-0 px-1.5 text-2xs">
                Primary
              </Badge>
            ) : null}
            {pr.origin === "agent" ? (
              <Badge variant="secondary" className="shrink-0 px-1.5 text-2xs">
                Opened by agent
              </Badge>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            <span className="shrink-0">#{pr.prNumber}</span>
            <span className="shrink-0">{STATE_LABEL[pr.state]}</span>
            {pr.linkedRepo ? (
              <span className="truncate">
                {pr.repoOwner}/{pr.repoName}
              </span>
            ) : null}
            {pr.headBranch ? (
              <span className="truncate font-mono">{pr.headBranch}</span>
            ) : null}
            <span className="ml-auto shrink-0">
              <RelativeDateTime at={pr.updatedAt} />
            </span>
          </div>
        </div>
        <a
          href={pr.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open #${pr.prNumber} on GitHub`}
          title="Open on GitHub"
          className={cn(
            LIST_ROW_CONTROL_CLASS,
            "shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <IconExternalLink size={14} />
        </a>
      </div>
    </ListRow>
  );
}
