import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

function source(path: string): string {
  return readFileSync(join(convexDir, path), "utf8").replaceAll("\r\n", "\n");
}

function definitionBody(path: string, name: string): string {
  const text = source(path);
  const start = text.indexOf(`export const ${name} =`);
  expect(start, `${path}:${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = text.indexOf("\n});", start);
  return text.slice(start, end < 0 ? undefined : end);
}

describe("measured Convex I/O hot paths stay on compact reads", () => {
  test("claimPendingTurn polls only the compact chat row", () => {
    // The 50ms daemon poll reads the `sessionChats` row by id and nothing
    // else. The heavyweight session (plan, terminal tail, panes) is read only
    // once a turn is actually pending, for the sandbox-setup gate.
    const body = definitionBody("_sessions/workflow.ts", "claimPendingTurn");
    const chatReadAt = body.indexOf("await ctx.db.get(args.chatId)");
    const ownerFastPathAt = body.indexOf("chat.userId !== ctx.userId");
    const repoAccessAt = body.indexOf("hasRepoAccess(");
    const pendingGateAt = body.indexOf("if (!chat.pendingTurn) return drained;");
    const sessionReadAt = body.indexOf("await ctx.db.get(chat.sessionId)");
    expect(chatReadAt, "the chat row read moved").toBeGreaterThan(-1);
    expect(ownerFastPathAt, "the owner fast path moved").toBeGreaterThan(
      chatReadAt,
    );
    expect(repoAccessAt, "repo access must sit behind the owner check").toBeGreaterThan(
      ownerFastPathAt,
    );
    expect(pendingGateAt, "the pendingTurn gate moved").toBeGreaterThan(-1);
    expect(
      sessionReadAt,
      "the session may only be read once a turn is pending",
    ).toBeGreaterThan(pendingGateAt);
    expect(body).not.toContain('.query("sessionDaemonStates")');
    expect(body).not.toContain("session.pendingTurn");
  });

  test("daemon signals live on the chat row, with no mirror table", () => {
    // Daemons poll `sessionChats` directly; `sessionDaemonStates` is a legacy
    // table only the backfill (which empties it) and repo deletion still touch.
    const allowed = [
      "_migrations/backfillSessionChats.ts",
      "_migrations/deleteRepos.ts",
    ];
    const mirrorUsers = convexFiles().filter((path) =>
      /(?:query|insert)\("sessionDaemonStates"/.test(source(path)),
    );
    expect(mirrorUsers.sort()).toEqual(allowed.sort());
    // Every session daemon signal writer patches the chat it belongs to.
    expect(source("_sessions/execution.ts")).toContain(
      "ctx.db.patch(chat._id, { cancelRequestedAt: Date.now() })",
    );
    expect(source("_chat/surfaceAdapters.ts")).toContain(
      "ctx.db.patch(chat._id, { cancelRequestedAt: Date.now() })",
    );
    expect(source("usageLimits.ts")).toContain(
      "ctx.db.patch(chat._id, { usageRefreshRequestedAt: now })",
    );
    expect(
      definitionBody("_sessions/workflow.ts", "requestStopBackgroundAgent"),
    ).toContain("pendingTaskStops: [...pending, args.toolUseId]");
    for (const path of convexFiles()) {
      expect(source(path), path).not.toContain("syncSessionDaemonState");
    }
  });

  test("task lists use summaries and every run creator updates them", () => {
    const list = definitionBody("_agentTasks/queries.ts", "getAllTasks");
    expect(source("_agentTasks/queries.ts")).toContain(
      '.query("agentTaskRunSummaries")',
    );
    expect(list).toContain('withIndex("by_repo_status_and_deleted"');

    const runCreators = convexFiles().filter((path) =>
      source(path).includes('insert("agentRuns"'),
    );
    expect(runCreators.length).toBeGreaterThan(0);
    for (const path of runCreators) {
      expect(source(path), path).toContain("setTaskLastRunStartedAt");
    }
  });

  test("list filters are index ranges, not post-read filters", () => {
    const sessions = definitionBody("_sessions/queries.ts", "list");
    expect(sessions).toContain('withIndex("by_repo_archived_and_deleted"');
    expect(sessions).not.toContain(".filter(");

    const mentions = definitionBody("_mentions/listData.ts", "listData");
    expect(mentions).toContain('withIndex("by_repo_and_deleted"');
    expect(mentions).toContain('withIndex("by_repo_status_and_deleted"');
    expect(mentions).not.toContain("filterActiveEntities");
  });

  test("skill list metadata no longer writes new SKILL.md bodies inline", () => {
    const apply = definitionBody("repoSkills.ts", "applyGithubSync");
    expect(apply).toContain("upsertRepoSkillContent");
    expect(apply).toContain("content: undefined");
    expect(source("repoSkills.ts")).toContain('.query("repoSkillContents")');
    expect(source("dataMigrations.ts")).toContain("splitRepoSkillContent");
  });

  test("only the platform presence room owns lastSeenAt", () => {
    expect(source("presence.ts")).toContain(
      'const LAST_SEEN_ROOM_ID = "platform"',
    );
    const body = definitionBody("presence.ts", "heartbeat");
    expect(body).toContain("roomId === LAST_SEEN_ROOM_ID");
    expect(body).toContain("getUserPresenceRow");
    expect(body).toContain("upsertUserPresence");
    expect(body).not.toContain("patch(ctx.userId");
  });

  test("path and lastSeen writes stay off the users table", () => {
    const updatePath = definitionBody("presence.ts", "updatePath");
    expect(updatePath).toContain("getUserPresenceRow");
    expect(updatePath).toContain("upsertUserPresence");
    expect(updatePath).not.toContain("patch(ctx.userId");
    expect(definitionBody("users.ts", "listAll")).not.toContain(
      "getUserPresenceRow",
    );
    expect(source("schema.ts")).toContain("userPresence:");
  });

  test("listByParent skips storage URL work for text-only transcripts", () => {
    expect(source("_messages/media.ts")).toContain(
      "export function messageNeedsUrlResolution",
    );
    const messages = source("messages.ts");
    expect(messages).toContain("messageNeedsUrlResolution");
    expect(messages).toContain("messages.some(messageNeedsUrlResolution)");
  });

  test("listByParent ships activity steps without their expanded-only detail", () => {
    expect(source("_messages/activityLog.ts")).toContain(
      "export function trimActivityLogForTranscript",
    );
    const list = definitionBody("messages.ts", "listByParent");
    expect(list).toContain("trimActivityLogForTranscript");
    expect(source("messages.ts")).toContain("export const activityLogById");
  });

  test("users.getMany reads only the requested docs", () => {
    const body = definitionBody("users.ts", "getMany");
    expect(body).toContain("ctx.db.get(id)");
    expect(body).not.toContain(".collect()");
  });

  test("listAll reads teammates, not every user", () => {
    const body = definitionBody("users.ts", "listAll");
    expect(body).toContain('query("teamMembers")');
    expect(body).toContain("collectDirectoryUserIds");
    expect(body).not.toContain('query("users")');
  });
});

function convexFiles(): string[] {
  return readdirSync(convexDir, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !path.includes("_generated"))
    .filter((path) => !path.endsWith(".generated.ts"));
}
