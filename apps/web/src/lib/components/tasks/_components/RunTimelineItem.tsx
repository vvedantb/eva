"use client";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Badge,
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
  ActivityTasks,
  formatElapsed,
  ProviderIcon,
  formatModelDisplayLabel,
  findModelOption,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconLoader2, IconPlayerStop } from "@tabler/icons-react";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";
import dayjs, { formatExactDateTime } from "@eva/shared/dates";
import { UserInitials } from "@eva/shared/user-initials";
import { EvaIcon } from "@/lib/components/EvaIcon";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import type { FunctionReturnType } from "convex/server";
import { AI_MODEL_OPTIONS, getAIModelProvider } from "@eva/backend";
import type { api } from "@eva/backend";
import {
  MarkdownMentionText,
  MARKDOWN_PROSE_CLASS,
} from "@/lib/components/chat/MarkdownMentionText";
import { useRepo } from "@/lib/contexts/RepoContext";
import { getUserDisplayName } from "./task-detail-constants";
import type { TaskComment } from "../_utils/commentThread";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { formatDuration } from "@eva/shared/duration";
import { RunActivityLog } from "../RunActivityLog";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";

const summaryPlugins = { cjk, math, mermaid };

/** Matches scroll cap used for run logs inside the same accordion. */
const RUN_ACCORDION_SCROLL_CLASS =
  "max-h-60 overflow-y-auto overflow-x-hidden scrollbar scroll-fade";

type Run = NonNullable<
  FunctionReturnType<typeof api.agentRuns.listByTask>
>[number];
type Streaming = FunctionReturnType<typeof api.streaming.get>;
type Users = FunctionReturnType<typeof api.users.listAll>;

/** Human-readable badge label for a run. The error/queued/cancelled labels are
 * the same everywhere; only running/success vary by run mode and whether the
 * run was triggered by a change-request comment. */
function getRunStatusLabel(run: Run, hasRunComment: boolean): string {
  switch (run.status) {
    case "cancelled":
      return "cancelled";
    case "error":
      return "error";
    case "queued":
      return "queued";
    case "running":
      if (run.mode === "resolve_conflicts") return "resolving conflicts";
      if (hasRunComment) return "making changes";
      return "running";
    case "success":
      if (run.mode === "resolve_conflicts") return "resolved conflicts";
      if (hasRunComment) return "made changes";
      return "success";
  }
}

export function RunTimelineItem({
  run,
  isActiveRun,
  activityInChat = false,
  streaming,
  activeRunElapsed,
  isStopping,
  onStopConfirm,
  runComment,
  runCommentReplies,
  users,
}: {
  run: Run;
  isActiveRun: boolean;
  /**
   * This run's activity streams into the sandbox chat as a normal turn, so the
   * steps and the log are left out here rather than shown twice.
   */
  activityInChat?: boolean;
  streaming: Streaming | undefined;
  activeRunElapsed: number;
  isStopping: boolean;
  onStopConfirm: () => void;
  runComment: TaskComment | undefined;
  runCommentReplies: TaskComment[];
  users: Users | undefined;
}) {
  const hasRunComment = runComment !== undefined;
  // The run's initiator: the change-request comment's author when the run was
  // started via "Make changes", otherwise whoever clicked the button. Legacy
  // runs predating `triggeredBy` show no initiator.
  const requesterUserId = runComment?.authorId ?? run.triggeredBy;
  const requester = requesterUserId
    ? users?.find((user) => user._id === requesterUserId)
    : undefined;

  const runDuration =
    isActiveRun && run.startedAt ? (
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatElapsed(activeRunElapsed)}
      </span>
    ) : run.startedAt && run.finishedAt ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(run.startedAt, run.finishedAt)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Completed {formatExactDateTime(run.finishedAt)}
        </TooltipContent>
      </Tooltip>
    ) : null;

  const statusLabel = getRunStatusLabel(run, hasRunComment);
  const modelProvider = run.model ? getAIModelProvider(run.model) : null;
  const modelDisplayLabel =
    run.model && modelProvider
      ? formatModelDisplayLabel(
          modelProvider,
          findModelOption(run.model, AI_MODEL_OPTIONS)?.label ?? run.model,
        )
      : null;

  return (
    <Accordion type="multiple" defaultValue={[]}>
      <AccordionItem value={run._id} className="border-none">
        {/* Header: person avatar sits on the shared activity timeline rail. */}
        <div className="flex gap-2">
          <div className="relative z-10 flex w-4 shrink-0 items-start justify-center bg-background pt-1.5">
            {requesterUserId ? (
              <UserInitials userId={requesterUserId} size="sm" hideLastSeen />
            ) : (
              <EvaIcon size={16} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AccordionTrigger className="min-w-0 flex-1 py-1.5">
              <div className="mr-2 flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {requester ? (
                    <span
                      data-pii
                      className="truncate text-xs font-medium text-foreground"
                    >
                      {getUserDisplayName(requester)}
                    </span>
                  ) : null}
                  <AnimatePresence mode="wait" initial={false}>
                    <m.span
                      key={statusLabel}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={motionFast}
                      className="inline-flex"
                    >
                      <Badge
                        variant={
                          run.status === "running"
                            ? "warning"
                            : run.status === "error"
                              ? "destructive"
                              : run.status === "success"
                                ? "success"
                                : "secondary"
                        }
                      >
                        {statusLabel}
                      </Badge>
                    </m.span>
                  </AnimatePresence>
                  {modelProvider && modelDisplayLabel ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex shrink-0 text-muted-foreground">
                          <ProviderIcon provider={modelProvider} size={12} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {run.credentialSourceLabel
                          ? `${modelDisplayLabel} · ${run.credentialSourceLabel}`
                          : modelDisplayLabel}
                      </TooltipContent>
                    </Tooltip>
                  ) : run.credentialSourceLabel ? (
                    <Badge variant="secondary">
                      {run.credentialSourceLabel}
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                  <RelativeDateTime
                    at={run.startedAt}
                    className="shrink-0 text-xs"
                  />
                </div>
                {runDuration}
              </div>
            </AccordionTrigger>
            {isActiveRun && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      title={skipConfirmTitle("Stop")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStopConfirm();
                      }}
                      disabled={isStopping}
                    >
                      {isStopping ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconPlayerStop size={14} />
                      )}
                      Stop
                      <ConfirmSkipHint />
                    </Button>
                  </div>
                </TooltipTrigger>
              </Tooltip>
            )}
          </div>
        </div>
        <AccordionContent>
          <div className="ml-6 space-y-2">
            {runComment ? (
              <div
                className={`ml-2 space-y-2 border-l-2 border-muted-foreground/25 pl-3 ${RUN_ACCORDION_SCROLL_CLASS}`}
              >
                <RunInlineComment comment={runComment} users={users} />
                {runCommentReplies.map((reply) => (
                  <div key={reply._id} className="ml-2 pl-2">
                    <RunInlineComment comment={reply} users={users} />
                  </div>
                ))}
              </div>
            ) : null}
            {activityInChat ? (
              <p className="text-xs text-muted-foreground">
                Eva is working in the sandbox chat — open the Sandbox tab to
                follow along.
              </p>
            ) : (
              <>
                {run.status === "running" &&
                  streaming?.currentActivity &&
                  (() => {
                    const steps = parseActivitySteps(streaming.currentActivity);
                    return steps ? (
                      <ActivityTasks steps={steps} isStreaming />
                    ) : (
                      <Reasoning isStreaming defaultOpen>
                        <ReasoningTrigger
                          getThinkingMessage={(s) =>
                            s ? "Working..." : "Processing complete"
                          }
                        />
                        <ReasoningContent>
                          {streaming.currentActivity}
                        </ReasoningContent>
                      </Reasoning>
                    );
                  })()}
                <RunActivityLog
                  runId={run._id}
                  isActive={isActiveRun}
                  finalText={run.resultSummary}
                  startedAt={run.startedAt}
                  finishedAt={run.finishedAt}
                />
              </>
            )}
            {run.resultSummary && (
              <Streamdown
                className="text-sm text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                plugins={summaryPlugins}
              >
                {run.resultSummary}
              </Streamdown>
            )}
            {run.error && (
              <div className="rounded bg-destructive/10 p-2 text-sm text-destructive">
                {run.error}
              </div>
            )}
            {run.logs.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-muted-foreground">Logs</p>
                <div
                  className={`space-y-1 rounded bg-muted p-2 font-mono text-xs ${RUN_ACCORDION_SCROLL_CLASS}`}
                >
                  {run.logs.map((log, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 ${
                        log.level === "error"
                          ? "text-destructive"
                          : log.level === "warn"
                            ? "text-warning"
                            : "text-muted-foreground"
                      }`}
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {dayjs(log.timestamp).format("DD/MM/YYYY HH:mm")}
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}{" "}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function RunInlineComment({
  comment,
  users,
}: {
  comment: TaskComment;
  users: Users | undefined;
}) {
  const { basePath, repo } = useRepo();
  const author = comment.authorId
    ? users?.find((user) => user._id === comment.authorId)
    : undefined;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {comment.authorId ? (
            <UserInitials userId={comment.authorId} size="sm" />
          ) : null}
          {author ? (
            <span
              data-pii
              className="truncate text-xs font-medium text-foreground"
            >
              {getUserDisplayName(author)}
            </span>
          ) : null}
        </div>
        <RelativeDateTime at={comment.createdAt} className="shrink-0 text-xs" />
      </div>
      {/* Same renderer and `atKind` as CommentActivityItem — this is the same
          `taskComments.content`, so the two views must not diverge. */}
      <MarkdownMentionText
        text={comment.content}
        repoBasePath={basePath}
        repoId={repo._id}
        atKind="user"
        className={`${MARKDOWN_PROSE_CLASS} text-sm wrap-break-word`}
      />
    </div>
  );
}
