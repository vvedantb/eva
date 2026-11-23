import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import prosemirrorSync from "@convex-dev/prosemirror-sync/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { ensureWorkSession } from "../convex/_sessions/ownedSession";
import { findOwnedSession } from "../convex/_sessions/owner";
import { PLANNING_INTERVIEW_DOC_TITLE } from "../convex/_migrations/convertProjects";
import { buildProjectBranchName } from "../convex/_git/branchNames";

/**
 * Step 9's conversion of old projects (`_migrations/convertProjects.ts`): a
 * dry run only counts, a run converts each case, and a second run changes
 * nothing.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const SPEC = JSON.stringify({
  title: "Offline mode",
  description: "Keep working when the network drops.",
  tasks: [
    { title: "Cache layer", description: "Store reads.", dependencies: [] },
    { title: "Sync", description: "Replay writes.", dependencies: [1] },
  ],
});

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  prosemirrorSync.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|convert" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Offline",
      rawInput: "Offline mode",
      phase: "business_review",
      planningMode: "interview",
      numId: 1,
    });
    await ctx.db.insert("projectDetails", {
      projectId,
      conversationHistory: [
        { role: "user", content: "Offline mode" },
        {
          role: "assistant",
          content: JSON.stringify({
            question: "Which screens must work offline?",
            options: [{ label: "All", description: "Every screen" }],
          }),
        },
        { role: "user", content: "The task list only." },
        { role: "assistant", content: SPEC },
      ],
      generatedSpec: SPEC,
    });
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("project missing");
    const { session: projectSession } = await ensureWorkSession(ctx, {
      kind: "project",
      project,
    });
    const now = Date.now();
    let chatNumber = 2;
    const taskWithOldChat = async (
      title: string,
      taskNumber: number,
      status: Doc<"agentTasks">["status"],
    ) => {
      const taskId = await ctx.db.insert("agentTasks", {
        repoId,
        projectId,
        title,
        taskNumber,
        status,
        numId: taskNumber,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      });
      const chatId = await ctx.db.insert("sessionChats", {
        sessionId: projectSession._id,
        repoId,
        userId,
        title,
        number: chatNumber,
        isMain: false,
        taskId,
      });
      chatNumber += 1;
      await ctx.db.insert("messages", {
        parentId: chatId,
        role: "user",
        content: `${title} history`,
        timestamp: now,
      });
      return { taskId, chatId };
    };
    const done = await taskWithOldChat("Done task", 1, "done");
    const running = await taskWithOldChat("Running task", 2, "in_progress");
    const runId = await ctx.db.insert("agentRuns", {
      taskId: running.taskId,
      repoId,
      status: "running",
      logs: [],
      startedAt: now,
    });
    await ctx.db.patch(running.taskId, {
      run: { state: "running", workflowId: "wf-old-run", runId },
    });
    const todo = await taskWithOldChat("Todo task", 3, "todo");
    const review = await taskWithOldChat("Review task", 4, "code_review");
    await ctx.db.patch(projectSession._id, {
      archive: { archivedAt: now },
    });

    // A project whose old build was running, with a todo task.
    const buildingId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Building",
      rawInput: "Building",
      phase: "in_progress",
      build: { state: "running", workflowId: "wf-old-build" },
      numId: 2,
    });
    const buildTodo = await ctx.db.insert("agentTasks", {
      repoId,
      projectId: buildingId,
      title: "Queued by the build",
      taskNumber: 1,
      status: "todo",
      numId: 5,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    return {
      userId,
      repoId,
      projectId,
      projectSessionId: projectSession._id,
      done,
      running,
      runId,
      todo,
      review,
      buildingId,
      buildTodo,
    };
  });
  return { t, ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const convert = (f: Fixture, dryRun: boolean) =>
  f.t.action(internal._migrations.convertProjects.convertProjects, { dryRun });

const ownSession = (f: Fixture, taskId: Id<"agentTasks">) =>
  f.t.run((ctx) => findOwnedSession(ctx.db, { kind: "task", taskId }));

describe("convertProjects", () => {
  test(
    "a dry run reports counts and the in-progress tasks on old project branches, and writes nothing",
    async () => {
      const f = await fixture();
      const report = await convert(f, true);
      expect(report).toMatchObject({
        done: true,
        failed: 0,
        projects: 2,
        projectsChanged: 2,
        summaryDocs: 1,
        planningDocs: 1,
        readOnlyHistories: 1,
        movedChats: 2,
        reviewTasksOnProjectBranch: 1,
        tasksApproved: 1,
        todoTasksLeftUnapproved: 1,
        legacyBuildsStopped: 1,
        coordinatorSessionsRevived: 1,
      });
      expect(report.inProgressTasksOnProjectBranch).toEqual([
        {
          projectId: f.projectId,
          projectTitle: "Offline",
          taskId: f.running.taskId,
          taskNumber: 2,
          title: "Running task",
          branchName: buildProjectBranchName(f.projectId),
          runStopped: true,
          projectPrLive: false,
        },
      ]);
      const after = await f.t.run(async (ctx) => ({
        docs: await ctx.db.query("docs").collect(),
        chat: await ctx.db.get(f.running.chatId),
        run: await ctx.db.get(f.runId),
        buildTodo: await ctx.db.get(f.buildTodo),
      }));
      expect(after.docs).toEqual([]);
      expect(after.chat?.taskId).toBe(f.running.taskId);
      expect(after.run?.status).toBe("running");
      expect(after.buildTodo?.approvedAt).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "a run converts each case, and a second run changes nothing",
    async () => {
      const f = await fixture();
      await convert(f, false);

      // The spec is the summary; the interview is its own doc.
      const { project, docs } = await f.t.run(async (ctx) => ({
        project: await ctx.db.get(f.projectId),
        docs: await ctx.db
          .query("docs")
          .withIndex("by_source_project", (q) =>
            q.eq("sourceProjectId", f.projectId),
          )
          .collect(),
      }));
      const summary = docs.find((doc) => doc._id === project?.summaryDocId);
      expect(summary?.content).toContain("## Goal");
      expect(summary?.content).toContain("Keep working when the network drops.");
      expect(summary?.content).toContain("**Sync** (after #1)");
      const planning = docs.find(
        (doc) => doc.title === PLANNING_INTERVIEW_DOC_TITLE,
      );
      expect(planning?.content).toContain(
        "**Eva:** Which screens must work offline?",
      );
      expect(planning?.content).toContain("**Person:** The task list only.");

      // A done task: its old chat is the Main chat of an archived session.
      const doneSession = await ownSession(f, f.done.taskId);
      expect(doneSession?.archive).toBeDefined();
      expect(doneSession?.sandboxId).toBeUndefined();
      const doneChat = await f.t.run((ctx) => ctx.db.get(f.done.chatId));
      expect(doneChat).toMatchObject({
        sessionId: doneSession?._id,
        number: 1,
        isMain: true,
      });
      expect(doneChat?.taskId).toBeUndefined();
      const history = await f.t.run((ctx) =>
        ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", f.done.chatId))
          .collect(),
      );
      expect(history.map((row) => row.content)).toEqual(["Done task history"]);

      // The running task: stopped, keeps the project branch, approved.
      const running = await f.t.run(async (ctx) => ({
        task: await ctx.db.get(f.running.taskId),
        run: await ctx.db.get(f.runId),
      }));
      const projectBranch = buildProjectBranchName(f.projectId);
      expect(running.task).toMatchObject({
        status: "todo",
        branchName: projectBranch,
      });
      expect(running.task?.approvedAt).toBeDefined();
      expect(running.task?.run).toBeUndefined();
      expect(running.run).toMatchObject({
        status: "cancelled",
        exitReason: "project_conversion",
      });
      const runningSession = await ownSession(f, f.running.taskId);
      expect(runningSession?.branchName).toBe(projectBranch);
      expect(runningSession?.archive).toBeUndefined();

      // A todo task of a project with no build: its own session, unapproved.
      const todoSession = await ownSession(f, f.todo.taskId);
      expect(todoSession?.archive).toBeUndefined();
      const todoTask = await f.t.run((ctx) => ctx.db.get(f.todo.taskId));
      expect(todoTask?.approvedAt).toBeUndefined();
      expect(todoTask?.branchName).toBeUndefined();

      // The project whose old build ran: its todo task is approved, the build gone.
      const building = await f.t.run(async (ctx) => ({
        project: await ctx.db.get(f.buildingId),
        task: await ctx.db.get(f.buildTodo),
      }));
      expect(building.project?.build).toBeUndefined();
      expect(building.task?.approvedAt).toBeDefined();

      // The coordinator session an old close archived is live again.
      const coordinator = await f.t.run((ctx) =>
        ctx.db.get(f.projectSessionId),
      );
      expect(coordinator?.archive).toBeUndefined();

      // Idempotent: the second run finds nothing to do.
      const again = await convert(f, false);
      expect(again).toMatchObject({
        done: true,
        projects: 2,
        projectsChanged: 0,
        summaryDocs: 0,
        planningDocs: 0,
        readOnlyHistories: 0,
        movedChats: 0,
        chatsJoinedExistingSession: 0,
        tasksApproved: 0,
        legacyBuildsStopped: 0,
        coordinatorSessionsRevived: 0,
        inProgressTasksOnProjectBranch: [],
      });
      const docCount = await f.t.run(
        async (ctx) => (await ctx.db.query("docs").collect()).length,
      );
      expect(docCount).toBe(2);
    },
    TIMEOUT_MS,
  );
});
