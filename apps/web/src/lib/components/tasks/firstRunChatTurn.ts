import type { FunctionReturnType } from "convex/server";
import type { api, Doc } from "@eva/backend";
import type { ChatBodyMessage } from "@/lib/components/chat/chatBodyUtils";

type AgentRun = FunctionReturnType<typeof api.agentRuns.listByTask>[number];

/**
 * The fields the rule below reads, spelled out structurally instead of taking
 * the whole `AgentRun`: callers still get their own row type back (see the
 * generic), and the rule stays exercisable in a test without fabricating
 * Convex ids. `triggeringCommentId` widens to `string` for the same reason —
 * only whether it is set matters here.
 */
type ChatTurnRunFields = {
  status: AgentRun["status"];
  mode?: AgentRun["mode"];
  resultSummary?: string;
  triggeringCommentId?: string;
  startedAt?: number;
  _creationTime: number;
};

/** A run that has not settled yet: its activity is still being streamed. */
export function isRunInProgress(status: AgentRun["status"]): boolean {
  return status === "queued" || status === "running";
}

/**
 * The streaming row a task run writes its live activity to. Mirrors the
 * server's `getTaskRunStreamingEntityId`, which is internal to the Convex
 * package; every client reader goes through this one helper.
 */
export function taskRunStreamingEntityId(runId: string): string {
  return `task-run-${runId}`;
}

/**
 * The run that renders as the opening assistant turn of the sandbox chat
 * rather than as activity in the timeline — both surfaces key off this one
 * function so they can never disagree about which run moved. It is the
 * earliest initial run that is either still in flight (its live activity
 * streams into the chat bubble) or a settled success with a `resultSummary`
 * (its activity log and reply render as a finished turn).
 *
 * Everything else stays with the timeline: failed or cancelled attempts (that
 * is where `run.error` and the raw launch logs render), a success with no
 * `resultSummary` (the chat turn would have no reply text), "Make changes"
 * runs (they belong to their triggering comment) and Resolve Conflicts runs.
 *
 * A run that fails therefore hands its slot back to the timeline when it
 * settles. The timeline keeps its row throughout — see `TaskDetailInline`,
 * which only drops the row once the run has settled into the chat.
 */
export function findFirstRunChatTurnRun<Run extends ChatTurnRunFields>(
  runs: readonly Run[] | undefined,
): Run | undefined {
  let first: Run | undefined;
  for (const run of runs ?? []) {
    if (!isRunInProgress(run.status)) {
      if (run.status !== "success" || !run.resultSummary) continue;
    }
    if (run.triggeringCommentId !== undefined) continue;
    if (run.mode === "resolve_conflicts") continue;
    const startedAt = run.startedAt ?? run._creationTime;
    if (!first || startedAt < (first.startedAt ?? first._creationTime)) {
      first = run;
    }
  }
  return first;
}

/**
 * The assistant row's content for a first run, which is the only part of the
 * turn that differs between an in-flight and a settled run.
 *
 * In flight it is the live streaming placeholder: empty content and **no**
 * `finishedAt`, exactly the shape `findStreamingTargetMessage` looks for, so
 * the run's steps stream into the bubble like a session turn. Settled, it
 * carries the reply and always sets `finishedAt` — an assistant row without it
 * reads as that same placeholder and would swallow the next turn's tokens.
 */
export function firstRunAssistantContent({
  status,
  resultSummary,
  finishedAt,
  activityLog,
  startedAt,
}: {
  status: AgentRun["status"];
  resultSummary?: string;
  finishedAt?: number;
  /** Resolved log for the run — `null` when it has none. */
  activityLog: string | null;
  startedAt: number;
}): { content: string; activityLog?: string; finishedAt?: number } {
  if (isRunInProgress(status)) return { content: "" };
  return {
    content: resultSummary ?? "",
    ...(activityLog !== null ? { activityLog } : {}),
    finishedAt: finishedAt ?? startedAt,
  };
}

/**
 * The first run as a normal chat turn: the task prompt (title + description)
 * as the user message, the run's activity log + result summary as the
 * assistant reply. While the run is still in flight the assistant row is an
 * empty, unfinished bubble instead — that is the shape `findStreamingTargetMessage`
 * looks for, so the run's live activity streams into it exactly like a session
 * turn. Ids are synthetic but stable so React keys and the changed-files
 * expansion map behave like real messages.
 */
export function buildFirstRunChatTurn({
  task,
  run,
  activityLog,
  attachments,
  media,
}: {
  task: Pick<
    Doc<"agentTasks">,
    "_id" | "title" | "description" | "createdAt" | "createdBy"
  >;
  run: AgentRun;
  /**
   * Resolved log for the run — `null` when the run has none, which is always
   * the case while it is in flight (the log is written once on completion).
   */
  activityLog: string | null;
  /** Task attachments resolved to URLs, shown on the prompt bubble. */
  attachments?: { url: string | null; contentType: string | null }[];
  /**
   * Screenshots and recordings the run captured, resolved to URLs. They ride
   * the assistant reply exactly like a chat turn's media — the run is the only
   * place they are stored, since this turn has no `messages` row.
   */
  media?: { url: string | null; contentType: string | null }[];
}): ChatBodyMessage[] {
  const startedAt = run.startedAt ?? run._creationTime;
  return [
    {
      _id: `first-run-${run._id}-user`,
      _creationTime: task.createdAt,
      parentId: task._id,
      role: "user",
      content: task.description
        ? `${task.title}\n\n${task.description}`
        : task.title,
      timestamp: task.createdAt,
      userId: task.createdBy,
      // Snapshots stored on the run; findPrecedingUserTurn reads them off the
      // user turn to show the model icon under the assistant reply.
      ...(run.model !== undefined ? { model: run.model } : {}),
      ...(run.credentialSourceLabel !== undefined
        ? { credentialSourceLabel: run.credentialSourceLabel }
        : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    },
    {
      _id: `first-run-${run._id}-assistant`,
      _creationTime: startedAt,
      parentId: task._id,
      role: "assistant",
      timestamp: startedAt,
      ...(media && media.length > 0 ? { media } : {}),
      ...firstRunAssistantContent({
        status: run.status,
        ...(run.resultSummary !== undefined
          ? { resultSummary: run.resultSummary }
          : {}),
        ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
        activityLog,
        startedAt,
      }),
    },
  ];
}
