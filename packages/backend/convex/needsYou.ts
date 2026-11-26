import { taskRunFailedAt } from "./_agentTasks/taskRunStatus";
import { v } from "convex/values";
import { entityHref, repoBasePath } from "@eva/shared";
import {
  needsYouGroupForProjectTask,
  needsYouGroupForQuickTask,
  needsYouGroupForSession,
} from "@eva/shared/needsYou";
import { parsePendingQuestion } from "@eva/shared/pendingQuestion";
import { isNeedsYouNotification } from "@eva/shared/notificationRouting";
import { authQuery, hasRepoAccess } from "./functions";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { gatherAccessibleRepos } from "./_githubRepos/helpers";
import { loadProjectTaskRows } from "./_projects/taskTable";
import { isSessionArchived } from "./_sessions/archive";

/**
 * The Inbox's "Needs you" rows (`@eva/shared/needsYou`): what waits for the
 * caller now, derived from live state. Projects show to everyone who can
 * open their repo (as the project's own task list does); quick tasks and
 * sessions show to the person who made them.
 *
 * - Questions: a project task's open ask the coordinator handed to a person,
 *   any blocking agent question (`pendingQuestions`) on an open turn, and an
 *   unread notification that asks for the caller in a chat: a teammate's
 *   `@`-mention, a routed question, an agent's `notify_user`
 *   (`isNeedsYouNotification`; posting in that chat reads it).
 * - To review: an open (not draft) PR of a project task, quick task or session.
 * - Failed: a project task whose retries are spent, or a quick task whose
 *   last run failed.
 */

const needsYouRowValidator = v.object({
  /** Stable per row: the group plus the entity it is about. */
  key: v.string(),
  group: v.union(
    v.literal("question"),
    v.literal("review"),
    v.literal("failed"),
  ),
  title: v.string(),
  /** The second line: the question, the PR number, the task number. */
  detail: v.optional(v.string()),
  source: v.union(
    v.literal("project"),
    v.literal("quick_task"),
    v.literal("session"),
  ),
  projectTitle: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  taskId: v.optional(v.id("agentTasks")),
  prUrl: v.optional(v.string()),
  /** The web page it opens. */
  href: v.optional(v.string()),
  /** The chat the phone opens (`chats.get` target). */
  chatTarget: v.optional(v.string()),
  /** The reply thread in that chat the phone opens. */
  threadRootId: v.optional(v.id("messages")),
  /**
   * The chat the row is about, as its owner's id (a task, project or
   * standalone session): the Inbox keeps one row for each chat.
   */
  chatKey: v.string(),
  /** The task's or session's number, for the Inbox's source line. */
  numId: v.optional(v.number()),
  /** The notification behind a row that asks for the caller; archiving it clears the row. */
  notificationId: v.optional(v.id("notifications")),
  repoId: v.id("githubRepos"),
  /** When it started to wait, for the row's age and the order. */
  at: v.number(),
});

export type NeedsYouRow = typeof needsYouRowValidator.type;

/** Most quick tasks and sessions of one person one repo reads per kind. */
const PER_KIND_LIMIT = 100;

export const list = authQuery({
  args: { repoId: v.optional(v.id("githubRepos")) },
  returns: v.array(needsYouRowValidator),
  handler: async (ctx, args) => {
    const repos = await inboxRepos(ctx.db, ctx.userId, args.repoId);
    const { live, asks } = await collectNeedsYou(ctx.db, ctx.userId, repos);
    return [...live, ...asks];
  },
});

/** The repos the Inbox reads: every repo the caller can open, or the one asked for. */
export async function inboxRepos(
  db: DatabaseReader,
  userId: Id<"users">,
  repoId: Id<"githubRepos"> | undefined,
): Promise<Doc<"githubRepos">[]> {
  if (repoId === undefined) return await gatherAccessibleRepos(db, userId, false);
  if (!(await hasRepoAccess(db, repoId, userId))) return [];
  const repo = await db.get(repoId);
  return repo ? [repo] : [];
}

/**
 * The Needs you rows, split by where they come from: `live` from the state of
 * tasks, sessions and turns, `asks` from unread notifications that ask for
 * the caller in a chat. The Inbox files the two in different groups.
 */
export async function collectNeedsYou(
  db: DatabaseReader,
  userId: Id<"users">,
  repos: readonly Doc<"githubRepos">[],
): Promise<{ live: NeedsYouRow[]; asks: NeedsYouRow[] }> {
  const [perRepo, asks] = await Promise.all([
    Promise.all(repos.map((repo) => repoRows(db, repo, userId))),
    notificationRows(db, userId, new Set(repos.map((repo) => repo._id))),
  ]);
  return { live: perRepo.flat(), asks };
}

async function repoRows(
  db: DatabaseReader,
  repo: Doc<"githubRepos">,
  userId: Id<"users">,
): Promise<NeedsYouRow[]> {
  const [projects, quickTasks, sessions, questions] = await Promise.all([
    projectRows(db, repo, userId),
    quickTaskRows(db, repo, userId),
    sessionRows(db, repo, userId),
    questionRows(db, repo, userId),
  ]);
  return [...projects, ...quickTasks, ...sessions, ...questions];
}

/** Most unread notifications the notification rows look through. */
const NOTIFICATION_SCAN_LIMIT = 100;

/**
 * The caller's unread notifications that ask for them in a chat, as
 * Questions. A row leaves once the caller posts in that chat
 * (`notifyChatMentions` reads it) or marks it Done in the Inbox.
 */
async function notificationRows(
  db: DatabaseReader,
  userId: Id<"users">,
  repoIds: ReadonlySet<Id<"githubRepos">>,
): Promise<NeedsYouRow[]> {
  const unread = (
    await db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .order("desc")
      .take(NOTIFICATION_SCAN_LIMIT)
  ).filter(
    (row) =>
      isNeedsYouNotification(row) &&
      row.archivedAt === undefined &&
      row.repoId !== undefined &&
      repoIds.has(row.repoId),
  );
  const rows = await Promise.all(
    unread.map(async (row): Promise<NeedsYouRow | null> => {
      const { chatTarget, repoId } = row;
      if (chatTarget === undefined || repoId === undefined) return null;
      const source = await chatSource(db, chatTarget);
      if (!source) return null;
      return {
        key: `notification:${row._id}`,
        group: "question",
        title: row.title,
        detail: row.message,
        source: source.kind,
        projectTitle: source.projectTitle,
        projectId: source.projectId,
        href: row.href,
        chatTarget,
        threadRootId: row.threadRootId,
        chatKey: chatTarget,
        notificationId: row._id,
        repoId,
        at: row.createdAt,
      };
    }),
  );
  return rows.filter((row) => row !== null);
}

/** Which kind of chat a notification's `chatTarget` names. */
async function chatSource(
  db: DatabaseReader,
  chatTarget: string,
): Promise<{
  kind: NeedsYouRow["source"];
  projectId?: Id<"projects">;
  projectTitle?: string;
} | null> {
  const projectId = db.normalizeId("projects", chatTarget);
  if (projectId) {
    const project = await db.get(projectId);
    return project
      ? { kind: "project", projectId, projectTitle: project.title }
      : null;
  }
  const taskId = db.normalizeId("agentTasks", chatTarget);
  if (taskId) {
    const task = await db.get(taskId);
    if (!task) return null;
    if (task.projectId === undefined) return { kind: "quick_task" };
    const project = await db.get(task.projectId);
    return {
      kind: "project",
      projectId: task.projectId,
      projectTitle: project?.title,
    };
  }
  return db.normalizeId("sessions", chatTarget) ? { kind: "session" } : null;
}

/** Each live project's child tasks that wait for a person. */
async function projectRows(
  db: DatabaseReader,
  repo: Doc<"githubRepos">,
  userId: Id<"users">,
): Promise<NeedsYouRow[]> {
  const projects = await db
    .query("projects")
    .withIndex("by_repo_and_archived", (q) =>
      q.eq("repoId", repo._id).eq("archivedAt", undefined),
    )
    .collect();
  const base = repoBasePath(repo);
  const perProject = await Promise.all(
    projects.map(async (project) => {
      const rows = await loadProjectTaskRows(db, project, userId);
      const waiting = rows.flatMap((row) => {
        if (row.locked) return [];
        const group = needsYouGroupForProjectTask(row.needsYou);
        return group ? [{ row, group }] : [];
      });
      const tasks = await Promise.all(
        waiting.map(({ row }) => db.get(row.taskId)),
      );
      return waiting.flatMap(({ row, group }, index): NeedsYouRow[] => {
        const task = tasks[index];
        if (!task) return [];
        const number = task.numId !== undefined ? `#${task.numId}` : undefined;
        const detail =
          group === "question"
            ? row.openAsk
            : group === "review" && task.prUrl
              ? `PR ${prLabel(task.prUrl)}`
              : number;
        return [
          {
            key: `${group}:${task._id}`,
            group,
            title: task.title,
            detail,
            source: "project",
            projectTitle: project.title,
            projectId: project._id,
            taskId: task._id,
            prUrl: group === "review" ? task.prUrl : undefined,
            href:
              project.numId !== undefined && task.numId !== undefined
                ? `${base}/projects/${project.numId}/${task.numId}/activity`
                : undefined,
            chatTarget: String(task._id),
            chatKey: String(task._id),
            numId: task.numId,
            repoId: repo._id,
            at: task.updatedAt,
          },
        ];
      });
    }),
  );
  return perProject.flat();
}

/** The caller's quick tasks with an open PR to review, or a failed last run. */
async function quickTaskRows(
  db: DatabaseReader,
  repo: Doc<"githubRepos">,
  userId: Id<"users">,
): Promise<NeedsYouRow[]> {
  const byStatus = (status: "code_review" | "business_review" | "todo") =>
    db
      .query("agentTasks")
      .withIndex("by_repo_status_archived_and_creator", (q) =>
        q
          .eq("repoId", repo._id)
          .eq("status", status)
          .eq("archivedAt", undefined)
          .eq("createdBy", userId),
      )
      .order("desc")
      .take(PER_KIND_LIMIT);
  const [codeReview, businessReview, todo] = await Promise.all([
    byStatus("code_review"),
    byStatus("business_review"),
    byStatus("todo"),
  ]);
  const quick = (tasks: Doc<"agentTasks">[]) =>
    tasks.filter((task) => task.projectId === undefined);
  const todoTasks = quick(todo);
  // A quick task runs as task-mode turns in its chat (`taskRunStatus.ts`).
  const failedAts = await Promise.all(
    todoTasks.map((task) => taskRunFailedAt(db, task)),
  );
  const candidates = [
    ...quick([...codeReview, ...businessReview]).map((task) => ({
      task,
      lastRunFailed: false,
      runError: undefined,
      at: task.updatedAt,
    })),
    ...todoTasks.map((task, index) => {
      const failedAt = failedAts[index] ?? null;
      return {
        task,
        lastRunFailed: failedAt !== null,
        // Runs are chat turns now (#1557); the failed turn's error is not read here yet.
        runError: undefined,
        at: failedAt ?? task.updatedAt,
      };
    }),
  ];
  return candidates.flatMap(({ task, lastRunFailed, runError, at }): NeedsYouRow[] => {
    const group = needsYouGroupForQuickTask({
      status: task.status,
      prState: task.prState,
      lastRunFailed,
    });
    if (!group) return [];
    return [
      {
        key: `${group}:${task._id}`,
        group,
        title: task.title,
        // The source line already names "#N"; a failed run says why.
        detail:
          group === "review" && task.prUrl
            ? `PR ${prLabel(task.prUrl)}`
            : runError,
        source: "quick_task",
        taskId: task._id,
        prUrl: group === "review" ? task.prUrl : undefined,
        href: entityHref("task", repo, task.numId),
        chatTarget: String(task._id),
        chatKey: String(task._id),
        numId: task.numId,
        repoId: repo._id,
        at,
      },
    ];
  });
}

/** The caller's live standalone sessions with an open PR to review. */
async function sessionRows(
  db: DatabaseReader,
  repo: Doc<"githubRepos">,
  userId: Id<"users">,
): Promise<NeedsYouRow[]> {
  const sessions = await db
    .query("sessions")
    .withIndex("by_repo_owner_deleted_and_archived_at", (q) =>
      q
        .eq("repoId", repo._id)
        .eq("owner.kind", "standalone")
        .eq("deletedAt", undefined)
        .eq("archive.archivedAt", undefined),
    )
    .order("desc")
    .take(PER_KIND_LIMIT);
  return sessions.flatMap((session): NeedsYouRow[] => {
    if (session.userId !== userId || isSessionArchived(session)) return [];
    const group = needsYouGroupForSession(session);
    if (!group) return [];
    return [
      {
        key: `${group}:${session._id}`,
        group,
        title: session.title,
        detail: session.prUrl ? `PR ${prLabel(session.prUrl)}` : undefined,
        source: "session",
        prUrl: session.prUrl,
        href: entityHref("session", repo, session.numId),
        chatTarget: String(session._id),
        chatKey: String(session._id),
        numId: session.numId,
        repoId: repo._id,
        at: session.updatedAt ?? session._creationTime,
      },
    ];
  });
}

/**
 * Blocking agent questions (`pendingQuestions`) on the repo's open chat
 * turns: only an open turn can hold one, so this reads one small range per
 * open turn. A session's or quick task's question goes to its maker; a
 * project's (coordinator or task chat) to everyone on the repo.
 */
async function questionRows(
  db: DatabaseReader,
  repo: Doc<"githubRepos">,
  userId: Id<"users">,
): Promise<NeedsYouRow[]> {
  const turns = (
    await db
      .query("turns")
      .withIndex("by_repo_open", (q) =>
        q.eq("repoId", repo._id).eq("open", true),
      )
      .collect()
  ).filter((turn) => turn.lane === undefined && turn.sessionId !== undefined);
  const base = repoBasePath(repo);
  const perTurn = await Promise.all(
    turns.map(async (turn): Promise<NeedsYouRow | null> => {
      const [pending, session] = await Promise.all([
        db
          .query("pendingQuestions")
          .withIndex("by_entity", (q) =>
            q.eq("entityId", String(turn.entityId)),
          )
          .collect(),
        turn.sessionId ? db.get(turn.sessionId) : null,
      ]);
      const open = pending.find((row) => row.answer === undefined);
      if (!open || !session) return null;
      const question = parsePendingQuestion(open.payload)?.[0]?.question;
      const common = {
        key: `question:${open._id}`,
        group: "question" as const,
        detail: question,
        chatTarget: String(turn.entityId),
        repoId: repo._id,
        at: open.createdAt,
      };
      const owner = session.owner;
      if (owner.kind === "standalone") {
        if (session.userId !== userId) return null;
        return {
          ...common,
          title: session.title,
          source: "session",
          chatKey: String(session._id),
          numId: session.numId,
          href: entityHref("session", repo, session.numId),
        };
      }
      if (owner.kind === "project") {
        const project = await db.get(owner.projectId);
        if (!project) return null;
        return {
          ...common,
          title: project.title,
          source: "project",
          projectTitle: project.title,
          projectId: project._id,
          chatKey: String(project._id),
          href: entityHref("project", repo, project.numId),
        };
      }
      const task = await db.get(owner.taskId);
      if (!task) return null;
      if (task.projectId === undefined) {
        if (task.createdBy !== userId) return null;
        return {
          ...common,
          title: task.title,
          source: "quick_task",
          taskId: task._id,
          chatKey: String(task._id),
          numId: task.numId,
          href: entityHref("task", repo, task.numId),
        };
      }
      const project = await db.get(task.projectId);
      if (!project) return null;
      return {
        ...common,
        title: task.title,
        source: "project",
        projectTitle: project.title,
        projectId: project._id,
        taskId: task._id,
        chatKey: String(task._id),
        numId: task.numId,
        href:
          project.numId !== undefined && task.numId !== undefined
            ? `${base}/projects/${project.numId}/${task.numId}/activity`
            : undefined,
      };
    }),
  );
  return perTurn.filter((row) => row !== null);
}

/** "#9003" from a GitHub PR URL, else the URL's last part. */
function prLabel(prUrl: string): string {
  const number = prUrl.split("/").pop();
  return number ? `#${number}` : prUrl;
}
