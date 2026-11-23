"use client";

import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { cn } from "@eva/ui";
import { prStateLabel, type PrState } from "@eva/shared";
import type { NeedsYouReason } from "@eva/shared/projectStatus";
import {
  NEEDS_YOU_LABELS,
  WAITING_FOR_COORDINATOR_LABEL,
} from "@eva/shared/projectView";
import {
  Badge,
  LIST_ROW_CONTROL_CLASS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import {
  IconAlertTriangle,
  IconGitPullRequest,
  IconHelpCircle,
  IconMessage,
  IconX,
} from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { prStateIconClass } from "@/lib/components/prStateIconClass";
import { RepoAppMark, type RepoAppMarkRepo } from "@/lib/components/RepoLogo";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** The task card's metadata badge size (`QuickTaskCard` tags and project). */
const BADGE_CLASS = "max-w-40 px-1.5 py-0 text-3xs font-medium leading-4";

/** Reports a row's tooltip lists; the badge counts all of them. */
const MAX_REPORTS_SHOWN = 3;

/** The open question, with the "asked a question" icon (`AwaitingAnswerMark`). */
function AskBadge({ ask, interactive }: { ask: string; interactive: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={cn(BADGE_CLASS, interactive && "hover:bg-muted")}
    >
      <span className="flex min-w-0 items-center gap-0.5">
        <IconHelpCircle className="size-2.5 shrink-0 text-warning" />
        <span className="truncate">{ask}</span>
      </span>
    </Badge>
  );
}

/**
 * A project task row's extra badges, after its tags: why it needs you (or
 * that it waits for its coordinator), its open question, linked to the task
 * chat where a person answers it, its open reports, its phase label, a
 * feedback origin, its repo when it is not the home repo, and its PR. A
 * contributor can cancel a todo task nobody approved yet (rejects it).
 */
export function ProjectTaskBadges({
  taskId,
  needsYou,
  waitingForCoordinator,
  ask,
  reports,
  chatHref,
  phaseLabel,
  isFeedback,
  repo,
  prUrl,
  prState,
  canCancel,
}: {
  taskId: Id<"agentTasks">;
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
  /** The task's open question (`report_to_coordinator` ask). */
  ask: string | undefined;
  /** The task's open reports, newest first. */
  reports: readonly string[];
  /** The task's chat, where a person answers its question. */
  chatHref: string | undefined;
  phaseLabel: string | undefined;
  isFeedback: boolean;
  /** Set only when the task's repo differs from the project's home repo. */
  repo: RepoAppMarkRepo | undefined;
  prUrl: string | undefined;
  prState: PrState | undefined;
  canCancel: boolean;
}) {
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  return (
    <>
      {needsYou ? (
        <Badge variant="secondary" className={BADGE_CLASS}>
          <span className="flex min-w-0 items-center gap-0.5">
            <IconAlertTriangle className="size-2.5 shrink-0 text-warning" />
            <span className="truncate">{NEEDS_YOU_LABELS[needsYou]}</span>
          </span>
        </Badge>
      ) : waitingForCoordinator ? (
        <Badge variant="secondary" className={BADGE_CLASS}>
          <span className="truncate">{WAITING_FOR_COORDINATOR_LABEL}</span>
        </Badge>
      ) : null}
      {ask ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {chatHref ? (
              <DynamicLink
                to={toInternalRepoHref(chatHref)}
                aria-label="Answer in the task chat"
                onClick={(event) => event.stopPropagation()}
                className={cn("min-w-0", LIST_ROW_CONTROL_CLASS)}
              >
                <AskBadge ask={ask} interactive />
              </DynamicLink>
            ) : (
              <span className="min-w-0">
                <AskBadge ask={ask} interactive={false} />
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent className="max-w-80 whitespace-pre-wrap">
            {ask}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {reports.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("min-w-0", LIST_ROW_CONTROL_CLASS)}>
              <Badge variant="secondary" className={BADGE_CLASS}>
                <span className="truncate">
                  {reports.length === 1
                    ? "1 report"
                    : `${reports.length} reports`}
                </span>
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent className="flex max-w-80 flex-col gap-1">
            {reports.slice(0, MAX_REPORTS_SHOWN).map((report, index) => (
              <span key={index} className="line-clamp-3 whitespace-pre-wrap">
                {report}
              </span>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {phaseLabel ? (
        <Badge variant="secondary" className={BADGE_CLASS}>
          <span className="truncate">{phaseLabel}</span>
        </Badge>
      ) : null}
      {isFeedback ? (
        <Badge variant="secondary" className={BADGE_CLASS}>
          <span className="flex min-w-0 items-center gap-0.5">
            <IconMessage className="size-2.5 shrink-0" />
            Feedback
          </span>
        </Badge>
      ) : null}
      {repo ? (
        <Badge variant="secondary" className={BADGE_CLASS}>
          <span className="flex min-w-0 items-center gap-1">
            <RepoAppMark repo={repo} />
            <span className="truncate">{repoDisplayLabel(repo)}</span>
          </span>
        </Badge>
      ) : null}
      {prUrl ? (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={LIST_ROW_CONTROL_CLASS}
        >
          <Badge
            variant="secondary"
            className={cn(BADGE_CLASS, "hover:bg-muted")}
          >
            <span className="flex min-w-0 items-center gap-0.5">
              <IconGitPullRequest
                className={cn("size-2.5 shrink-0", prStateIconClass(prState))}
              />
              {prStateLabel(prState)}
            </span>
          </Badge>
        </a>
      ) : null}
      {canCancel ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* design-check-ignore-next-line — the card kebab button (CARD_KEBAB_CLASS) */}
            <button
              type="button"
              aria-label="Cancel task"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                void catchMutationError(
                  updateStatus({ id: taskId, status: "cancelled" }),
                  "Couldn't cancel the task",
                  "project-task-cancel",
                );
              }}
              // The card kebab's look, shown at every width.
              className={cn(
                "ml-auto",
                CARD_KEBAB_CLASS,
                "sm:flex",
                LIST_ROW_CONTROL_CLASS,
              )}
            >
              <IconX className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Cancel task</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}
