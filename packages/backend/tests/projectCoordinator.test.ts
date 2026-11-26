import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { requestCoordinatorWake } from "../convex/_projects/coordinatorWake";
import { fileTaskReport } from "../convex/_projects/reports";
import { closeTurn, openSessionChatTurn } from "../convex/_chat/turnStore";
import { projectTaskNeedsYou } from "@eva/shared/projectStatus";
import { ensureTaskChat } from "../convex/_sessions/ownedSession";
import {
  applyProjectToolPolicy,
  projectCallerOf,
  projectTargetRefusal,
  projectToolAccess,
  type ProjectCaller,
  type ProjectTargetFacts,
} from "../convex/mcp/projectScope";
import { defineTool, type EvaTool } from "../convex/mcp/registry";
import { toolJsonResult } from "@vvedantb/server";
import { modules } from "./_helpers/convexModules";

/**
 * A project's coordinator and its child tasks (plan step 3 and 6.6): the ask
 * rules, the coordinator's automatic turns (idempotent, capped each hour), and
 * which MCP tools each side may use.
 */

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|project-coordinator";

// Answers start task runs (workflows); keep their steps from running.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Project",
      rawInput: "Project",
      numId: 1,
    });
    const insertTask = (title: string, taskNumber: number) =>
      ctx.db.insert("agentTasks", {
        repoId,
        projectId,
        title,
        taskNumber,
        status: "in_progress",
        approvedAt: 1,
        numId: taskNumber,
        createdAt: 0,
        updatedAt: 0,
        createdBy: userId,
      });
    const a = await insertTask("A", 1);
    const b = await insertTask("B", 2);
    return { userId, repoId, projectId, a, b };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const ask = (f: Fixture, taskId: Id<"agentTasks">, text: string) =>
  f.t.mutation(internal._projects.reports.fileReportFromTask, {
    taskId,
    kind: "ask",
    text,
  });

const reports = (f: Fixture) =>
  f.asUser.query(api.projects.listTaskReports, { projectId: f.projectId });

const wakes = (f: Fixture) =>
  f.t.run((ctx) =>
    ctx.db
      .query("projectCoordinatorWakes")
      .withIndex("by_project_and_key", (q) => q.eq("projectId", f.projectId))
      .collect(),
  );

const factsOf = async (f: Fixture, taskId: Id<"agentTasks">) => {
  const rows = await f.asUser.query(api.agentTasks.listByProject, {
    projectId: f.projectId,
  });
  return rows.find((row) => row._id === taskId)?.facts;
};

describe("a child task's ask", () => {
  test(
    "wakes the coordinator at once, allows one open ask, and waits for the coordinator, then a person",
    async () => {
      const f = await fixture();
      await ask(f, f.a, "Which API version?");
      // Rule 5: one open ask for each task.
      await expect(ask(f, f.a, "And another?")).rejects.toThrow(
        /already has an open question/,
      );
      // Rule 2: an ask wakes the coordinator, keyed by the ask.
      const [wake] = await wakes(f);
      expect(wake?.reason).toBe("ask");
      expect(wake?.text).toContain("Which API version?");

      // Rule 1: the task stays in progress and waits for its coordinator.
      const waiting = await factsOf(f, f.a);
      expect(waiting?.status).toBe("in_progress");
      expect(waiting?.openAsk).toBe("coordinator");

      // The coordinator had a turn after the ask and did not answer: a person
      // must answer now.
      await f.t.run(async (ctx) => {
        await ctx.db.insert("sessions", {
          repoId: f.repoId,
          userId: f.userId,
          createdBy: f.userId,
          title: "Project",
          owner: { kind: "project", projectId: f.projectId },
          status: "closed",
          numId: 9,
          updatedAt: Date.now(),
          lastTurnFinishedAt: Date.now() + 1_000,
        });
      });
      expect((await factsOf(f, f.a))?.openAsk).toBe("person");
    },
    TIMEOUT_MS,
  );

  test(
    "the first answer wins: a person's answer closes the ask and a late coordinator answer is refused",
    async () => {
      const f = await fixture();
      await ask(f, f.a, "Which API version?");
      const chatId = await f.t.run(async (ctx) => {
        const task = await ctx.db.get(f.a);
        if (!task) throw new Error("task missing");
        return (await ensureTaskChat(ctx, task)).chat._id;
      });
      // Rule 4: a person answers in the task chat.
      await f.asUser.mutation(api._sessions.execution.enqueueMessage, {
        chatId,
        message: "Use v2.",
        model: DEFAULT_AI_MODEL,
      });
      const [answered] = await reports(f);
      expect(answered?.state).toBe("answered");
      expect(answered?.answeredBy).toBe(f.userId);
      // The answer is the task's next run: its chat message, with the answer
      // in the agent's prompt, and no second copy of the person's row.
      const { queued, userRows } = await f.t.run(async (ctx) => ({
        queued: await ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_order", (q) => q.eq("parentId", chatId))
          .collect(),
        userRows: (
          await ctx.db
            .query("messages")
            .withIndex("by_parent", (q) => q.eq("parentId", chatId))
            .collect()
        ).filter((row) => row.role === "user"),
      }));
      expect(queued.map((row) => [row.displayContent, row.taskRun])).toEqual([
        ["Use v2.", { mode: "implementation" }],
      ]);
      expect(queued[0]?.content).toContain("The answer from a person:\nUse v2.");
      expect(userRows).toEqual([]);

      // The coordinator's answer arrives late: not sent, no second run.
      const outcome = await f.t.mutation(
        internal._projects.reports.answerAskAsCoordinator,
        {
          taskId: f.a,
          projectId: f.projectId,
          userId: f.userId,
          message: "Use v1.",
        },
      );
      expect(outcome).toBe("answered_by_person");
    },
    TIMEOUT_MS,
  );

  test(
    "the coordinator's answer closes the ask; a later message is a plain message",
    async () => {
      const f = await fixture();
      await ask(f, f.b, "May I rename the table?");
      const first = await f.t.mutation(
        internal._projects.reports.answerAskAsCoordinator,
        { taskId: f.b, projectId: f.projectId, userId: f.userId, message: "Yes." },
      );
      expect(first).toBe("answered");
      const [answered] = await reports(f);
      expect(answered?.answeredBy).toBe("coordinator");
      const again = await f.t.mutation(
        internal._projects.reports.answerAskAsCoordinator,
        { taskId: f.b, projectId: f.projectId, userId: f.userId, message: "Also…" },
      );
      expect(again).toBe("none");
      // Another project's coordinator cannot answer this task.
      const otherProject = await f.t.run((ctx) =>
        ctx.db.insert("projects", {
          repoId: f.repoId,
          userId: f.userId,
          title: "Other",
          rawInput: "Other",
          numId: 2,
        }),
      );
      await expect(
        f.t.mutation(internal._projects.reports.answerAskAsCoordinator, {
          taskId: f.b,
          projectId: otherProject,
          userId: f.userId,
          message: "No.",
        }),
      ).rejects.toThrow(/not part of this project/);
    },
    TIMEOUT_MS,
  );

  test(
    "cancelling the task closes its open ask; a report does not wake the coordinator",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const task = await ctx.db.get(f.b);
        if (!task) throw new Error("task missing");
        await fileTaskReport(ctx, { task, kind: "report", text: "API changed" });
      });
      expect(await wakes(f)).toEqual([]);
      await ask(f, f.a, "Blocked on auth");
      await f.asUser.mutation(api.agentTasks.updateStatus, {
        id: f.a,
        status: "cancelled",
      });
      const rows = await reports(f);
      expect(rows.find((row) => row.taskId === f.a)?.state).toBe("closed");
    },
    TIMEOUT_MS,
  );
});

describe("a run that ended on its ask", () => {
  test(
    "waits, not failed, with no failure wake-up; a stop then halts it as stopped",
    async () => {
      const f = await fixture();
      // The task's run is a task-mode turn in its own chat; it asks, then its
      // turn ends.
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.a, { status: "in_progress" });
      });
      const turn = await f.t.run(async (ctx) => {
        const task = await ctx.db.get(f.a);
        if (!task) throw new Error("task missing");
        const { session, chat } = await ensureTaskChat(ctx, task);
        const turnId = await openSessionChatTurn(ctx, {
          chatId: chat._id,
          sessionId: session._id,
          streamingEntityId: String(chat._id),
          model: DEFAULT_AI_MODEL,
          repoId: f.repoId,
          taskRun: { mode: "implementation" },
        });
        return await ctx.db.get(turnId);
      });
      if (!turn) throw new Error("turn missing");
      await ask(f, f.a, "Which API version?");
      await f.t.run((ctx) => closeTurn(ctx, turn, "done"));

      const waiting = await factsOf(f, f.a);
      if (!waiting) throw new Error("facts missing");
      expect(waiting.status).toBe("in_progress");
      expect(waiting.halted).toBeUndefined();
      expect(waiting.openAsk).toBe("coordinator");
      expect(projectTaskNeedsYou(waiting)).toBeUndefined();
      // Only the ask woke the coordinator: no "failed" wake-up.
      expect((await wakes(f)).map((wake) => wake.reason)).toEqual(["ask"]);

      // A person stops the waiting task: the ask closes and the task halts
      // as stopped, so the scheduler does not restart it.
      await f.asUser.mutation(api.chats.stop, { target: f.a });
      const stopped = await factsOf(f, f.a);
      expect(stopped?.status).toBe("todo");
      expect(stopped?.halted).toBe("cancelled");
      expect(stopped?.openAsk).toBeUndefined();
      await f.t.mutation(internal.buildWorkflow.scheduleReadyTasks, {
        projectId: f.projectId,
      });
      const restarted = await f.t.run((ctx) =>
        ctx.db.query("queuedMessages").collect(),
      );
      expect(restarted.filter((row) => row.taskRun !== undefined)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("coordinator wake-ups", () => {
  test(
    "a second request with the same key does nothing, and a second delivery sends nothing",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        for (let i = 0; i < 2; i += 1) {
          await requestCoordinatorWake(ctx, {
            projectId: f.projectId,
            reason: "failed",
            key: "failed:run-1",
            text: "Task #1 failed",
          });
        }
      });
      expect(await wakes(f)).toHaveLength(1);
      await f.t.mutation(internal._projects.coordinatorWakeDelivery.deliverCoordinatorWakes, {
        projectId: f.projectId,
      });
      await f.t.mutation(internal._projects.coordinatorWakeDelivery.deliverCoordinatorWakes, {
        projectId: f.projectId,
      });
      const queued = await f.t.run((ctx) => ctx.db.query("queuedMessages").collect());
      expect(queued).toHaveLength(1);
      expect(queued[0]?.content).toContain("Task #1 failed");
      expect((await wakes(f))[0]?.sentAt).toBeDefined();
    },
    TIMEOUT_MS,
  );

  test(
    "there is no hourly cap: a wake-up after many automatic turns is still sent",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const now = Date.now();
        for (let i = 0; i < 20; i += 1) {
          await ctx.db.insert("projectCoordinatorWakes", {
            projectId: f.projectId,
            reason: "failed",
            key: `old-${i}`,
            text: "old",
            createdAt: now - 1_000,
            sentAt: now - 1_000 - i,
          });
        }
        await requestCoordinatorWake(ctx, {
          projectId: f.projectId,
          reason: "ask",
          key: "ask:new",
          text: "New question",
        });
      });
      await f.t.mutation(internal._projects.coordinatorWakeDelivery.deliverCoordinatorWakes, {
        projectId: f.projectId,
      });
      const fresh = (await wakes(f)).find((row) => row.key === "ask:new");
      expect(fresh?.sentAt).toBeDefined();
    },
    TIMEOUT_MS,
  );
});

describe("project tool rules", () => {
  const coordinator: ProjectCaller = { role: "coordinator", projectId: "p1" };
  const child: ProjectCaller = { role: "child", projectId: "p1", taskId: "t1" };

  test("each side gets only its tools", () => {
    const matrix = (caller: ProjectCaller | undefined) =>
      Object.fromEntries(
        [
          "create_tasks_batch",
          "create_and_run_task",
          "stop_agent",
          "update_project_summary",
          "retry_task",
          "start_task",
          "merge_task_into",
          "report_to_coordinator",
          "update_plan",
          "send_chat_message",
          "list_agents",
        ].map((name) => [name, projectToolAccess(caller, name).kind]),
      );
    expect(matrix(coordinator)).toEqual({
      create_tasks_batch: "allow",
      create_and_run_task: "hide",
      stop_agent: "allow",
      update_project_summary: "allow",
      retry_task: "allow",
      start_task: "allow",
      merge_task_into: "allow",
      report_to_coordinator: "hide",
      update_plan: "refuse",
      send_chat_message: "allow",
      list_agents: "allow",
    });
    expect(matrix(child)).toEqual({
      create_tasks_batch: "hide",
      create_and_run_task: "allow",
      stop_agent: "hide",
      update_project_summary: "hide",
      retry_task: "hide",
      start_task: "hide",
      merge_task_into: "hide",
      report_to_coordinator: "allow",
      update_plan: "refuse",
      send_chat_message: "allow",
      list_agents: "allow",
    });
    expect(matrix(undefined)).toEqual({
      create_tasks_batch: "allow",
      create_and_run_task: "allow",
      stop_agent: "allow",
      update_project_summary: "hide",
      retry_task: "hide",
      start_task: "hide",
      merge_task_into: "hide",
      report_to_coordinator: "hide",
      update_plan: "allow",
      send_chat_message: "allow",
      list_agents: "allow",
    });
  });

  test("a refused tool answers with an error instead of running", async () => {
    let ran = false;
    const tool: EvaTool = defineTool({
      name: "update_plan",
      description: "",
      mutating: true,
      input: {},
      handler: async () => {
        ran = true;
        return toolJsonResult({ ok: true });
      },
    });
    const [wrapped] = applyProjectToolPolicy([tool], coordinator);
    const result = await wrapped?.invoke("{}");
    expect(ran).toBe(false);
    expect(result?.isError).toBe(true);
    expect(applyProjectToolPolicy([tool], undefined)[0]).toBe(tool);
  });

  test("a child writes only to itself; a coordinator only to its project", () => {
    const sibling: ProjectTargetFacts = {
      kind: "task",
      targetId: "t2",
      projectId: "p1",
    };
    const self: ProjectTargetFacts = { kind: "task", targetId: "t1", projectId: "p1" };
    const project: ProjectTargetFacts = {
      kind: "project",
      targetId: "p1",
      projectId: "p1",
    };
    const elsewhere: ProjectTargetFacts = { kind: "session", targetId: "s1" };
    expect(projectTargetRefusal(child, sibling, "write")).toMatch(/sibling/);
    expect(projectTargetRefusal(child, project, "write")).toMatch(/sibling/);
    expect(projectTargetRefusal(child, self, "write")).toBeNull();
    expect(projectTargetRefusal(child, sibling, "read")).toBeNull();
    expect(projectTargetRefusal(coordinator, sibling, "write")).toBeNull();
    expect(projectTargetRefusal(coordinator, elsewhere, "write")).toMatch(
      /own project/,
    );
    expect(projectTargetRefusal(undefined, sibling, "write")).toBeNull();
  });

  test(
    "a token's chat resolves to the coordinator's project or the child task",
    async () => {
      const f = await fixture();
      const projectChat = await f.asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "project", projectId: f.projectId },
      });
      const taskChat = await f.asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "task", taskId: f.a },
      });
      const resolve = (args: {
        entityKind?: "session" | "task" | "project";
        entityId?: string;
        chatId?: string;
      }) => f.t.query(internal.mcp.projectQueries.resolveCallerOwner, args);
      const coordinatorOwner = await resolve({
        entityKind: "session",
        entityId: projectChat.sessionId,
        chatId: projectChat.chatId,
      });
      expect(projectCallerOf(coordinatorOwner ?? undefined)).toEqual({
        role: "coordinator",
        projectId: f.projectId,
      });
      const childOwner = await resolve({
        entityKind: "session",
        entityId: taskChat.sessionId,
        chatId: taskChat.chatId,
      });
      expect(projectCallerOf(childOwner ?? undefined)).toEqual({
        role: "child",
        projectId: f.projectId,
        taskId: f.a,
      });
      // A task run's token names the task itself.
      const runOwner = await resolve({ entityKind: "task", entityId: f.b });
      expect(projectCallerOf(runOwner ?? undefined)).toEqual({
        role: "child",
        projectId: f.projectId,
        taskId: f.b,
      });
    },
    TIMEOUT_MS,
  );
});
