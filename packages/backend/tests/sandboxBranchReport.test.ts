import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * `sandboxGit.reportBranch` is written by the in-sandbox branch watcher every
 * time it reads `.git/HEAD` — an inotify hit plus a 15s poll, on every live
 * sandbox at once. Two properties keep that cheap and safe, and neither is
 * visible from the daemon side:
 *
 *  - It patches `sandboxBranch` and nothing else. Bumping `updatedAt` or
 *    `lastSandboxActivity` here would reorder every sidebar on a timer.
 *  - An unchanged reading writes nothing at all, because several daemon
 *    processes can share one filesystem.
 *
 * A refactor routing this through a generic "touch the entity" helper would
 * break both without failing a type check.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|sandbox-branch";
const STRANGER_CLERK_ID = "clerk|sandbox-branch-stranger";
const STAMP = 1_700_000_000_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const strangerUserId = await ctx.db.insert("users", {
      clerkId: STRANGER_CLERK_ID,
    });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Branch chip",
      status: "active",
      numId: 1,
      branchName: "eva/session-boot",
      updatedAt: STAMP,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Quick task",
      status: "code_review",
      numId: 2,
      createdAt: STAMP,
      updatedAt: STAMP,
      createdBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Project",
      phase: "in_progress",
      rawInput: "branch",
      numId: 3,
      updatedAt: STAMP,
    });
    // A task's and a project's checkout is their owned session's.
    const ownedSession = (
      title: string,
      owner:
        | { kind: "task"; taskId: typeof taskId }
        | { kind: "project"; projectId: typeof projectId },
    ) =>
      ctx.db.insert("sessions", {
        owner,
        repoId,
        userId,
        title,
        status: "active",
        updatedAt: STAMP,
      });
    const taskSessionId = await ownedSession("Quick task", {
      kind: "task",
      taskId,
    });
    const projectSessionId = await ownedSession("Project", {
      kind: "project",
      projectId,
    });
    return {
      userId,
      strangerUserId,
      repoId,
      sessionId,
      taskId,
      projectId,
      taskSessionId,
      projectSessionId,
    };
  });
  return {
    t,
    asUser: t.withIdentity({ subject: CLERK_ID }),
    asStranger: t.withIdentity({ subject: STRANGER_CLERK_ID }),
    ...ids,
  };
}

describe("sandboxGit.reportBranch", () => {
  test(
    "records the live branch on the session behind each surface without touching activity stamps",
    async () => {
      const f = await fixture();

      await f.asUser.mutation(api.sandboxGit.reportBranch, {
        target: { kind: "session", sessionId: f.sessionId },
        branch: "feature/live",
      });
      await f.asUser.mutation(api.sandboxGit.reportBranch, {
        target: { kind: "task", taskId: f.taskId },
        branch: "feature/live",
      });
      await f.asUser.mutation(api.sandboxGit.reportBranch, {
        target: { kind: "project", projectId: f.projectId },
        branch: "feature/live",
      });

      await f.t.run(async (ctx) => {
        const sessions = await Promise.all(
          [f.sessionId, f.taskSessionId, f.projectSessionId].map((id) =>
            ctx.db.get(id),
          ),
        );
        for (const session of sessions) {
          expect(session?.sandboxBranch).toBe("feature/live");
          expect(session?.updatedAt).toBe(STAMP);
        }
        // The branch Eva booted on is a separate fact and stays put.
        expect(sessions[0]?.branchName).toBe("eva/session-boot");
        const task = await ctx.db.get(f.taskId);
        const project = await ctx.db.get(f.projectId);
        expect(task?.updatedAt).toBe(STAMP);
        expect(project?.updatedAt).toBe(STAMP);
      });
    },
    TIMEOUT_MS,
  );

  test(
    "blank readings are ignored and long ones are trimmed and capped",
    async () => {
      const f = await fixture();

      await f.asUser.mutation(api.sandboxGit.reportBranch, {
        target: { kind: "session", sessionId: f.sessionId },
        branch: "   \n ",
      });
      expect(
        (await f.t.run((ctx) => ctx.db.get(f.sessionId)))?.sandboxBranch,
      ).toBe(undefined);

      await f.asUser.mutation(api.sandboxGit.reportBranch, {
        target: { kind: "session", sessionId: f.sessionId },
        branch: `  eva/${"b".repeat(400)}  `,
      });
      const stored = (await f.t.run((ctx) => ctx.db.get(f.sessionId)))
        ?.sandboxBranch;
      expect(stored?.length).toBe(255);
      expect(stored?.startsWith("eva/bbb")).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "a caller without access to the repo cannot report a branch",
    async () => {
      const f = await fixture();
      await expect(
        f.asStranger.mutation(api.sandboxGit.reportBranch, {
          target: { kind: "session", sessionId: f.sessionId },
          branch: "feature/stolen",
        }),
      ).rejects.toThrow();
      expect(
        (await f.t.run((ctx) => ctx.db.get(f.sessionId)))?.sandboxBranch,
      ).toBe(undefined);
    },
    TIMEOUT_MS,
  );

  test(
    "a task with no session has no checkout and is refused",
    async () => {
      const f = await fixture();
      const orphanTaskId = await f.t.run((ctx) =>
        ctx.db.insert("agentTasks", {
          title: "Repo-less task",
          status: "todo",
          numId: 9,
          createdAt: STAMP,
          updatedAt: STAMP,
          createdBy: f.userId,
        }),
      );
      await expect(
        f.asUser.mutation(api.sandboxGit.reportBranch, {
          target: { kind: "task", taskId: orphanTaskId },
          branch: "feature/live",
        }),
      ).rejects.toThrow();
    },
    TIMEOUT_MS,
  );
});
