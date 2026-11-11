import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import { sessionChatAdapter } from "../convex/_chat/surfaceAdapters";
import type { Doc } from "../convex/_generated/dataModel";

/**
 * A turn torn down with `sandboxStopped` closes its session, because the VM
 * that session was running is gone. Only an `active` session was running
 * that VM: a newer start (`starting`) or a stop in flight (`stopping`) owns
 * the status, and a late release must not close it. When the release does
 * close the session, its background processes are marked exited too, or the
 * chat panel keeps listing processes on a dead VM.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

type SessionStatus = Doc<"sessions">["status"];

async function sessionChatWithProcess(status: SessionStatus) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|ada" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Fix the login bug",
      status,
      sandboxId: "sbx_1",
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    const processId = await ctx.db.insert("backgroundProcesses", {
      sessionId,
      key: "dev",
      command: "pnpm dev",
      status: "running",
      startedAt: 0,
    });
    return { sessionId, chatId, processId };
  });
  const release = (sandboxStopped: boolean) =>
    t.run((ctx) =>
      sessionChatAdapter.release(ctx, ids.chatId, { sandboxStopped }),
    );
  const read = () =>
    t.run(async (ctx) => ({
      session: await ctx.db.get(ids.sessionId),
      process: await ctx.db.get(ids.processId),
    }));
  return { release, read };
}

describe("session chat release", () => {
  test(
    "a stopped sandbox closes an active session and exits its processes",
    async () => {
      const { release, read } = await sessionChatWithProcess("active");
      await release(true);
      const rows = await read();
      expect(rows.session?.status).toBe("closed");
      expect(rows.process?.status).toBe("exited");
      expect(rows.process?.exitedAt).toBeTypeOf("number");
    },
    TIMEOUT_MS,
  );

  test(
    "a late release leaves a newer start or a stop in flight alone",
    async () => {
      for (const status of ["starting", "stopping"] as const) {
        const { release, read } = await sessionChatWithProcess(status);
        await release(true);
        const rows = await read();
        expect(rows.session?.status, status).toBe(status);
        expect(rows.process?.status, status).toBe("running");
      }
    },
    TIMEOUT_MS,
  );

  test(
    "a release without a stopped sandbox keeps the session running",
    async () => {
      const { release, read } = await sessionChatWithProcess("active");
      await release(false);
      const rows = await read();
      expect(rows.session?.status).toBe("active");
      expect(rows.process?.status).toBe("running");
    },
    TIMEOUT_MS,
  );
});
