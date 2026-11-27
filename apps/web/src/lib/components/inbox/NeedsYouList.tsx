"use client";

import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import {
  Badge,
  Button,
  CenteredSpinner,
  EmptyState,
  RelativeDateTime,
} from "@vvedantb/ui";
import { IconInbox } from "@tabler/icons-react";
import { groupNeedsYou, needsYouSourceLabel } from "@eva/shared/needsYou";
import { isInternalAppHref } from "@eva/shared/safeUrl";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";

export type NeedsYouRow = FunctionReturnType<typeof api.needsYou.list>[number];

/**
 * The Inbox's "Needs you" list: questions, PRs to review, Triage and failed
 * runs, grouped in that order (`@eva/shared/needsYou`). A row leaves when
 * someone acts on it, so there is no read state and no detail pane: the row
 * opens its page, and its one action button does the work in place.
 */
export function NeedsYouList({ rows }: { rows: NeedsYouRow[] | undefined }) {
  if (rows === undefined) return <CenteredSpinner label="Loading inbox" />;
  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState.Root enter>
          <EmptyState.Icon icon={IconInbox} size={24} />
          <EmptyState.Title>Nothing needs you</EmptyState.Title>
        </EmptyState.Root>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
      {groupNeedsYou(rows).map((section) => (
        <div key={section.group}>
          <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {section.label}{" "}
              <span className="tabular-nums">{section.rows.length}</span>
            </span>
          </div>
          <div className="divide-y divide-border">
            {section.rows.map((row) => (
              <NeedsYouRowItem key={row.key} row={row} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NeedsYouRowItem({ row }: { row: NeedsYouRow }) {
  const navigate = useNavigate();
  const open = () => {
    if (row.href && isInternalAppHref(row.href)) {
      navigate(hrefToNavigateOptions(row.href));
    }
  };
  return (
    <div className="group flex items-center gap-3 px-4 hover:bg-muted/40">
      {/* design-check-ignore-next-line — a full-width two-line row; Button would force control height and padding */}
      <button
        onClick={open}
        className="motion-press flex min-w-0 flex-1 flex-col py-3 text-left active:scale-[0.99] focus-visible:outline-hidden"
      >
        <span className="truncate text-sm font-medium text-foreground">
          {row.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-3xs">
            {needsYouSourceLabel(row)}
          </Badge>
          {row.detail ? <span className="truncate">{row.detail}</span> : null}
        </span>
      </button>
      <NeedsYouAction row={row} onReply={open} />
      <RelativeDateTime
        at={row.at}
        className="shrink-0 text-xs tabular-nums text-muted-foreground"
      />
    </div>
  );
}

function NeedsYouAction({
  row,
  onReply,
}: {
  row: NeedsYouRow;
  onReply: () => void;
}) {
  const approve = useMutation(api.buildWorkflow.approveProjectTasks);
  const archive = useMutation(api.agentTasks.archive);
  const retry = useMutation(api.agentTasks.startExecution);
  const buttonClass = "h-7 shrink-0 text-xs";

  if (row.group === "question") {
    return (
      <Button
        size="sm"
        variant="outline"
        className={buttonClass}
        onClick={onReply}
      >
        Reply
      </Button>
    );
  }
  if (row.group === "review") {
    return row.prUrl ? (
      <Button size="sm" className={buttonClass} asChild>
        <a href={row.prUrl} target="_blank" rel="noreferrer">
          Open PR
        </a>
      </Button>
    ) : null;
  }
  const { taskId, projectId } = row;
  if (taskId === undefined) return null;
  if (row.group === "triage") {
    return (
      <span className="flex shrink-0 gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className={buttonClass}
          onClick={() =>
            void catchMutationError(
              archive({ id: taskId }),
              "Couldn't reject the task",
              "needs-you-reject",
            )
          }
        >
          Reject
        </Button>
        {projectId !== undefined ? (
          <Button
            size="sm"
            className={buttonClass}
            onClick={() =>
              void catchMutationError(
                approve({ projectId, taskIds: [taskId] }),
                "Couldn't approve the task",
                "needs-you-approve",
              )
            }
          >
            Approve
          </Button>
        ) : null}
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className={buttonClass}
      onClick={() =>
        void catchMutationError(
          retry({ id: taskId }),
          "Couldn't retry the task",
          "needs-you-retry",
        )
      }
    >
      Retry
    </Button>
  );
}
