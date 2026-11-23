import { v, type Infer } from "convex/values";
import { interviewTurnText, parseProjectSpec } from "@eva/shared";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import {
  getActiveTaskRun,
  recomputeProjectPhase,
} from "../functions";
import { entityVisible, isEntityDeleted } from "../numId";
import { getProjectDetails } from "../_projects/helpers";
import { insertProjectDoc, upsertProjectSummary } from "../_projects/summary";
import {
  finishProjectBuild,
  projectBuildWorkflowId,
} from "../_projects/buildState";
import { finishTaskRun, taskRunWorkflowId } from "../_agentTasks/runState";
import { cancelTrackedWorkflow } from "../workflowManager";
import { closeOpenTurn } from "../_chat/turnStore";
import {
  clearStreamingActivity,
  getTaskRunStreamingEntityId,
} from "../_taskWorkflow/helpers";
import { abandonTaskRunSandbox } from "../_sessions/sandbox";
import { archiveSession, isSessionArchived } from "../_sessions/archive";
import { findOwnedSession } from "../_sessions/owner";
import {
  insertWorkSession,
  isTerminalTaskStatus,
  syncProjectSession,
} from "../_sessions/ownedSession";
import { resolveProjectBranchName } from "../_git/branchNames";
import { findLivePullRequestOnBranch } from "../_pullRequests/store";

/**
 * Step 9 of `internal/plans/todo/projects-as-orchestrator.md`: converts every
 * project made before the coordinator (decision 10, in place). Per project:
 *
 * 1. Its old spec (`projectDetails.generatedSpec`) becomes the project
 *    summary doc, as markdown, when the project has no summary yet.
 * 2. Its old interview (`projectDetails.conversationHistory`) is saved as a
 *    doc named "Planning interview", filed under the project.
 * 3. Each task chat that still lives in the project's session
 *    (`sessionChats.taskId`) moves to the task's own session:
 *    - a done, cancelled or deleted task: the chat becomes the Main chat of a
 *      new task session that is archived at once (read-only history, no
 *      sandbox);
 *    - an `in_progress` task that ran on the old project branch: its run is
 *      stopped, and the first such task of the project keeps that branch
 *      (`agentTasks.branchName`), so its work goes on in its own PR when a
 *      person restarts it. It is approved, since a person had started it;
 *    - any other task: the chat becomes the Main chat of its new session;
 *    - a task that already has its own session (it ran after Step 1): the
 *      old chat joins that session as a closed (archived) extra chat.
 * 4. Approval. A `todo` task of an old project was never approved
 *    (`approvedAt`), and the scheduler starts only approved tasks. They stay
 *    unapproved, so converting starts nothing a person did not ask for, with
 *    one exception: a project whose old build was running. A person started
 *    that build to run every todo task, so those tasks are approved and the
 *    build workflow is stopped; the scheduler then runs them in parallel.
 * 5. A coordinator session that an old phase-based close archived revives
 *    (`syncProjectSession`; a project has no closed state, decision 19).
 *
 * Idempotent: every step checks the state it would write, so a second run
 * changes nothing. Batched: one project per mutation, and the action stops
 * after `BATCH_TIME_BUDGET_MS` and goes on from its cursor. Deleted projects
 * are skipped. Nothing is removed: the old fields stay until the schema is
 * narrowed in a later deploy (see "Step 9 runbook" in the plan).
 *
 *   npx convex run migrations:convertProjects '{"dryRun": true}'
 *   npx convex run migrations:convertProjects
 */

/** One action run stops after this long, well inside the 10 minute action limit. */
const BATCH_TIME_BUDGET_MS = 4 * 60 * 1000;

/** Title of the doc that keeps an old project's planning interview. */
export const PLANNING_INTERVIEW_DOC_TITLE = "Planning interview";

/**
 * Longest transcript the planning doc keeps. A doc row holds at most 1 MiB;
 * the old transcript fit in one row with its activity logs, which the doc
 * leaves out.
 */
const MAX_PLANNING_DOC_CHARS = 400_000;

/** `exitReason` of a run this conversion stopped. */
const CONVERSION_EXIT_REASON = "project_conversion";

const keptBranchTaskValidator = v.object({
  projectId: v.id("projects"),
  projectTitle: v.string(),
  taskId: v.id("agentTasks"),
  taskNumber: v.optional(v.number()),
  title: v.string(),
  /** The old project branch the task keeps; absent when another task of the project kept it first. */
  branchName: v.optional(v.string()),
  /** It had a running run, which the conversion stops. */
  runStopped: v.boolean(),
  /** The project still has a live PR on that branch: the task's pushes land in it. */
  projectPrLive: v.boolean(),
});

const countsFields = {
  /** Projects visited (deleted ones are skipped and counted apart). */
  projects: v.number(),
  deletedProjectsSkipped: v.number(),
  /** Projects this run changed (or, in a dry run, would change). */
  projectsChanged: v.number(),
  summaryDocs: v.number(),
  planningDocs: v.number(),
  /** Done, cancelled or deleted tasks whose old chat became read-only history. */
  readOnlyHistories: v.number(),
  /** Other tasks whose old chat became the Main chat of their own session. */
  movedChats: v.number(),
  /** Old chats added, closed, to a task session that already existed. */
  chatsJoinedExistingSession: v.number(),
  /** Old chats whose task no longer exists (or has no repo); left in place. */
  orphanChats: v.number(),
  /** Review-stage tasks whose work is in the project's own PR (it stays the project's). */
  reviewTasksOnProjectBranch: v.number(),
  /** Todo tasks approved because their project's old build was running. */
  tasksApproved: v.number(),
  /** Todo tasks left unapproved (no build was running). */
  todoTasksLeftUnapproved: v.number(),
  legacyBuildsStopped: v.number(),
  coordinatorSessionsRevived: v.number(),
};

const projectResultValidator = v.object({
  ...countsFields,
  inProgressTasksOnProjectBranch: v.array(keptBranchTaskValidator),
});

type ProjectResult = Infer<typeof projectResultValidator>;
type KeptBranchTask = Infer<typeof keptBranchTaskValidator>;

function emptyResult(): ProjectResult {
  return {
    projects: 0,
    deletedProjectsSkipped: 0,
    projectsChanged: 0,
    summaryDocs: 0,
    planningDocs: 0,
    readOnlyHistories: 0,
    movedChats: 0,
    chatsJoinedExistingSession: 0,
    orphanChats: 0,
    reviewTasksOnProjectBranch: 0,
    tasksApproved: 0,
    todoTasksLeftUnapproved: 0,
    legacyBuildsStopped: 0,
    coordinatorSessionsRevived: 0,
    inProgressTasksOnProjectBranch: [],
  };
}

function addResults(a: ProjectResult, b: ProjectResult): ProjectResult {
  return {
    projects: a.projects + b.projects,
    deletedProjectsSkipped: a.deletedProjectsSkipped + b.deletedProjectsSkipped,
    projectsChanged: a.projectsChanged + b.projectsChanged,
    summaryDocs: a.summaryDocs + b.summaryDocs,
    planningDocs: a.planningDocs + b.planningDocs,
    readOnlyHistories: a.readOnlyHistories + b.readOnlyHistories,
    movedChats: a.movedChats + b.movedChats,
    chatsJoinedExistingSession:
      a.chatsJoinedExistingSession + b.chatsJoinedExistingSession,
    orphanChats: a.orphanChats + b.orphanChats,
    reviewTasksOnProjectBranch:
      a.reviewTasksOnProjectBranch + b.reviewTasksOnProjectBranch,
    tasksApproved: a.tasksApproved + b.tasksApproved,
    todoTasksLeftUnapproved:
      a.todoTasksLeftUnapproved + b.todoTasksLeftUnapproved,
    legacyBuildsStopped: a.legacyBuildsStopped + b.legacyBuildsStopped,
    coordinatorSessionsRevived:
      a.coordinatorSessionsRevived + b.coordinatorSessionsRevived,
    inProgressTasksOnProjectBranch: [
      ...a.inProgressTasksOnProjectBranch,
      ...b.inProgressTasksOnProjectBranch,
    ],
  };
}

/** True when the conversion changes anything for the project. */
function changesProject(result: ProjectResult): boolean {
  return (
    result.summaryDocs +
      result.planningDocs +
      result.readOnlyHistories +
      result.movedChats +
      result.chatsJoinedExistingSession +
      result.tasksApproved +
      result.legacyBuildsStopped +
      result.coordinatorSessionsRevived >
      0 || result.inProgressTasksOnProjectBranch.length > 0
  );
}

/** The old spec as the summary doc's markdown; raw text when it is not a plan. */
export function specSummaryMarkdown(
  project: Pick<Doc<"projects">, "title">,
  specJson: string,
): string {
  const spec = parseProjectSpec(specJson);
  if (!spec) {
    return `# ${project.title}\n\n## Plan from the old planning interview\n\n${specJson.trim()}\n`;
  }
  const tasks = spec.tasks.map((task, index) => {
    const body = task.description.trim();
    return `${index + 1}. **${task.title.trim() || "Untitled"}**${body ? `\n   ${body.replace(/\n/g, "\n   ")}` : ""}`;
  });
  return [
    `# ${spec.title.trim() || project.title}`,
    "## Goal",
    spec.description.trim() || "Not stated in the old plan.",
    "## Plan from the old planning interview",
    tasks.length > 0 ? tasks.join("\n") : "The old plan listed no tasks.",
  ].join("\n\n");
}

/** The old interview as readable markdown: who said what, questions as text. */
export function planningInterviewMarkdown(
  project: Pick<Doc<"projects">, "title">,
  history: Doc<"projectDetails">["conversationHistory"],
): string {
  const turns = history.flatMap((turn) => {
    const text =
      turn.role === "user" ? turn.content.trim() : interviewTurnText(turn.content);
    if (!text) return [];
    return [`**${turn.role === "user" ? "Person" : "Eva"}:** ${text}`];
  });
  const body = [
    `# Planning interview: ${project.title}`,
    "The interview this project was planned with, before projects had a coordinator chat. Kept as a record; the coordinator plans from now on.",
    ...turns,
  ].join("\n\n");
  return body.length > MAX_PLANNING_DOC_CHARS
    ? `${body.slice(0, MAX_PLANNING_DOC_CHARS)}\n\n[Cut at ${MAX_PLANNING_DOC_CHARS} characters.]`
    : body;
}

/** The project's live "Planning interview" doc, or null. */
async function findPlanningDoc(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<Doc<"docs"> | null> {
  const docs = await ctx.db
    .query("docs")
    .withIndex("by_source_project", (q) => q.eq("sourceProjectId", projectId))
    .collect();
  return (
    docs.find(
      (doc) =>
        doc.title === PLANNING_INTERVIEW_DOC_TITLE && !isEntityDeleted(doc),
    ) ?? null
  );
}

/**
 * Stops a task's run on the project's session, as the old build's cancel
 * did, but as a stop (`cancelled`), not a failure: the task then shows
 * "stopped" and waits for a person instead of waking the coordinator.
 * Returns whether a run was stopped.
 */
async function stopRunOnProjectSession(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
  projectSession: Doc<"sessions">,
): Promise<boolean> {
  await cancelTrackedWorkflow(ctx, taskRunWorkflowId(task));
  const run = await getActiveTaskRun(ctx.db, task._id);
  if (run) {
    await closeOpenTurn(ctx, run._id, "cancelled");
    // The VM is the coordinator's too: it stays up for its chat.
    await abandonTaskRunSandbox(ctx, projectSession._id, run, {
      keepActive: true,
    });
    await ctx.db.patch(run._id, {
      status: "cancelled",
      exitReason: CONVERSION_EXIT_REASON,
      finalizingAt: undefined,
      finishedAt: Date.now(),
    });
    await clearStreamingActivity(ctx, getTaskRunStreamingEntityId(run._id));
  }
  await ctx.db.patch(task._id, { status: "todo", updatedAt: Date.now() });
  await finishTaskRun(ctx, task._id, undefined);
  return run !== null;
}

/** The next chat number in a session (its chats are numbered from 1, Main). */
async function nextChatNumber(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<number> {
  const last = await ctx.db
    .query("sessionChats")
    .withIndex("by_session_and_number", (q) => q.eq("sessionId", sessionId))
    .order("desc")
    .first();
  return (last?.number ?? 0) + 1;
}

/** Moves an old task chat into the task's session as its Main chat. */
async function adoptChatAsMain(
  ctx: MutationCtx,
  chat: Doc<"sessionChats">,
  session: Doc<"sessions">,
): Promise<void> {
  await ctx.db.patch(chat._id, {
    sessionId: session._id,
    repoId: session.repoId,
    userId: session.userId,
    number: 1,
    isMain: true,
    archived: undefined,
    taskId: undefined,
  });
}

/**
 * Converts (or, with `dryRun`, only reports) one project. In a dry run it
 * writes nothing: every write below is behind `apply`.
 */
async function convertProject(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  dryRun: boolean,
): Promise<ProjectResult> {
  const result = emptyResult();
  const project = await ctx.db.get(projectId);
  if (!project) return result;
  if (isEntityDeleted(project)) {
    result.deletedProjectsSkipped = 1;
    return result;
  }
  result.projects = 1;
  const apply = !dryRun;

  // 1. The old spec becomes the summary doc.
  const details = await getProjectDetails(ctx.db, projectId);
  const summary = project.summaryDocId
    ? entityVisible(await ctx.db.get(project.summaryDocId))
    : null;
  if (!summary && details?.generatedSpec) {
    result.summaryDocs = 1;
    if (apply) {
      await upsertProjectSummary(
        ctx,
        projectId,
        specSummaryMarkdown(project, details.generatedSpec),
      );
    }
  }

  // 2. The old interview becomes the "Planning interview" doc.
  if (
    details &&
    details.conversationHistory.length > 0 &&
    !(await findPlanningDoc(ctx, projectId))
  ) {
    result.planningDocs = 1;
    if (apply) {
      await insertProjectDoc(
        ctx,
        project,
        PLANNING_INTERVIEW_DOC_TITLE,
        planningInterviewMarkdown(project, details.conversationHistory),
      );
    }
  }

  // 3. Old task chats in the project's session move to each task's session.
  const projectSession = await findOwnedSession(ctx.db, {
    kind: "project",
    projectId,
  });
  const oldChats = projectSession
    ? (
        await ctx.db
          .query("sessionChats")
          .withIndex("by_session", (q) =>
            q.eq("sessionId", projectSession._id),
          )
          .collect()
      ).filter((chat) => chat.taskId !== undefined)
    : [];
  const projectBranch = resolveProjectBranchName(projectId, project);
  const projectPrLive =
    (await findLivePullRequestOnBranch(
      ctx.db,
      project.repoId,
      projectBranch,
    )) !== null;
  let branchKept = false;
  for (const chat of oldChats) {
    const task = chat.taskId ? await ctx.db.get(chat.taskId) : null;
    // A task session needs the task's repo (`ownedSessionSeed`).
    if (!task || task.repoId === undefined || !projectSession) {
      result.orphanChats += 1;
      continue;
    }
    const own = await findOwnedSession(ctx.db, {
      kind: "task",
      taskId: task._id,
    });
    if (own) {
      // It ran after Step 1 and chats in its own Main chat already: the old
      // chat joins that session, closed.
      result.chatsJoinedExistingSession += 1;
      if (apply) {
        await ctx.db.patch(chat._id, {
          sessionId: own._id,
          repoId: own.repoId,
          userId: own.userId,
          number: await nextChatNumber(ctx, own._id),
          isMain: false,
          archived: true,
          taskId: undefined,
        });
      }
      continue;
    }
    if (isTerminalTaskStatus(task.status) || isEntityDeleted(task)) {
      result.readOnlyHistories += 1;
      if (apply) {
        const session = await insertWorkSession(ctx, { kind: "task", task });
        await adoptChatAsMain(ctx, chat, session);
        await archiveSession(ctx, session);
      }
      continue;
    }
    if (task.status === "in_progress") {
      // Its work is on the project branch. One branch has one writer: the
      // first such task keeps it; any other is listed for a person.
      const keeps = !branchKept;
      branchKept = true;
      const entry: KeptBranchTask = {
        projectId,
        projectTitle: project.title,
        taskId: task._id,
        taskNumber: task.taskNumber,
        title: task.title,
        ...(keeps ? { branchName: projectBranch } : {}),
        runStopped: task.run !== undefined,
        projectPrLive,
      };
      result.inProgressTasksOnProjectBranch.push(entry);
      if (apply) {
        await stopRunOnProjectSession(ctx, task, projectSession);
        await ctx.db.patch(task._id, {
          ...(keeps ? { branchName: projectBranch } : {}),
          approvedAt: task.approvedAt ?? Date.now(),
        });
        const kept = await ctx.db.get(task._id);
        if (kept) {
          await adoptChatAsMain(
            ctx,
            chat,
            await insertWorkSession(ctx, { kind: "task", task: kept }),
          );
        }
      }
      continue;
    }
    if (task.status === "business_review" || task.status === "code_review") {
      result.reviewTasksOnProjectBranch += 1;
    }
    result.movedChats += 1;
    if (apply) {
      await adoptChatAsMain(
        ctx,
        chat,
        await insertWorkSession(ctx, { kind: "task", task }),
      );
    }
  }

  // 4. Approval: only a running old build approved its todo tasks.
  const todoTasks = (
    await ctx.db
      .query("agentTasks")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", projectId).eq("status", "todo"),
      )
      .collect()
  ).filter(
    (task) =>
      !isEntityDeleted(task) &&
      task.approvedAt === undefined &&
      // Tasks this run stopped were approved above.
      !result.inProgressTasksOnProjectBranch.some((row) => row.taskId === task._id),
  );
  const buildWorkflowId = projectBuildWorkflowId(project);
  if (buildWorkflowId !== undefined) {
    result.legacyBuildsStopped = 1;
    result.tasksApproved = todoTasks.length;
    if (apply) {
      await cancelTrackedWorkflow(ctx, buildWorkflowId);
      await finishProjectBuild(ctx, projectId, buildWorkflowId);
      const now = Date.now();
      for (const task of todoTasks) {
        await ctx.db.patch(task._id, { approvedAt: now, updatedAt: now });
      }
    }
  } else {
    result.todoTasksLeftUnapproved = todoTasks.length;
  }

  // 5. A coordinator session an old phase-based close archived revives.
  if (projectSession && isSessionArchived(projectSession)) {
    result.coordinatorSessionsRevived = 1;
    if (apply) await syncProjectSession(ctx, projectId);
  }

  if (changesProject(result)) {
    result.projectsChanged = 1;
    // Derives the phase and lets the scheduler start approved tasks.
    if (apply) await recomputeProjectPhase(ctx, projectId);
  }
  return result;
}

/** Converts one project (`convertProject`); a dry run writes nothing. */
export const convertProjectStep = internalMutation({
  args: { projectId: v.id("projects"), dryRun: v.boolean() },
  returns: projectResultValidator,
  handler: async (ctx, args) => {
    return await convertProject(ctx, args.projectId, args.dryRun);
  },
});

/** The first project created after `cursor`, oldest first. */
export const nextProject = internalQuery({
  args: { cursor: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({ projectId: v.id("projects"), creationTime: v.number() }),
  ),
  handler: async (ctx, args) => {
    const cursor = args.cursor;
    const project = await ctx.db
      .query("projects")
      .withIndex("by_creation_time", (q) =>
        cursor === undefined ? q : q.gt("_creationTime", cursor),
      )
      .first();
    if (!project) return null;
    return { projectId: project._id, creationTime: project._creationTime };
  },
});

/**
 * Converts every project, oldest first, one project per mutation. With
 * `dryRun` it writes nothing and returns the counts and the list of
 * in-progress tasks on old project branches (show it to the user before the
 * production run). A real run that reaches its time budget schedules itself
 * from its cursor; a dry run returns `done: false` and its `cursor` instead,
 * to pass back in. A project that fails is logged, counted and skipped.
 */
export const convertProjects = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    ...countsFields,
    inProgressTasksOnProjectBranch: v.array(keptBranchTaskValidator),
    failed: v.number(),
    done: v.boolean(),
    cursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun === true;
    const deadline = Date.now() + BATCH_TIME_BUDGET_MS;
    let cursor = args.cursor;
    let total = emptyResult();
    let failed = 0;
    while (Date.now() < deadline) {
      const next = await ctx.runQuery(
        internal._migrations.convertProjects.nextProject,
        { cursor },
      );
      if (next === null) {
        console.log(
          `convertProjects ${dryRun ? "dry run " : ""}done: projects=${total.projects} changed=${total.projectsChanged} inProgressOnProjectBranch=${total.inProgressTasksOnProjectBranch.length} failed=${failed}`,
        );
        return { ...total, failed, done: true };
      }
      try {
        total = addResults(
          total,
          await ctx.runMutation(
            internal._migrations.convertProjects.convertProjectStep,
            { projectId: next.projectId, dryRun },
          ),
        );
      } catch (error) {
        failed += 1;
        console.error(
          `convertProjects: project ${next.projectId} failed, skipping`,
          error,
        );
      }
      cursor = next.creationTime;
    }
    console.log(
      `convertProjects ${dryRun ? "dry run " : ""}batch: projects=${total.projects} failed=${failed} cursor=${cursor}`,
    );
    if (!dryRun) {
      await ctx.scheduler.runAfter(
        0,
        internal._migrations.convertProjects.convertProjects,
        { cursor },
      );
    }
    return { ...total, failed, done: false, cursor };
  },
});
