import { v, type Infer } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { isEntityDeleted } from "../numId";
import {
  findPullRequestByUrl,
  listOwnerPullRequests,
  type PrOwnerRef,
} from "../_pullRequests/store";
import {
  chatKindValidator,
  ownerFor,
  samePrUrl,
  wakeTarget,
} from "../_pullRequests/watch";
import { unarchiveSession } from "../_sessions/prArchive";
import { buildWakeupMessage, wakeupLimitError } from "./rules";

/**
 * Chat wake-ups (`schedule_wakeup`). An agent asks Eva to send a prompt back
 * into its own chat later: at a set time, or a delay after one of the chat's
 * PRs merges. The PR merge arms the wake from the `pull_request` webhook; one
 * scheduled `fire` per wake sends it through `orchestratorSendMessage`, the
 * same path the PR watch uses. A merged session is unarchived first, so the
 * run shows in the active list. A woken agent re-arms by calling the tool
 * again; the lifetime cap in `rules.ts` ends any loop.
 */

type Wakeup = Doc<"chatWakeups">;

const LIVE_STATUSES = new Set<Wakeup["status"]>(["pending", "armed"]);

async function listOwnerWakeups(
  db: DatabaseReader,
  owner: PrOwnerRef,
): Promise<Wakeup[]> {
  if (owner.kind === "session") {
    return await db
      .query("chatWakeups")
      .withIndex("by_session", (q) => q.eq("owner.sessionId", owner.sessionId))
      .collect();
  }
  if (owner.kind === "task") {
    return await db
      .query("chatWakeups")
      .withIndex("by_task", (q) => q.eq("owner.taskId", owner.taskId))
      .collect();
  }
  return await db
    .query("chatWakeups")
    .withIndex("by_project", (q) => q.eq("owner.projectId", owner.projectId))
    .collect();
}

async function arm(
  ctx: MutationCtx,
  wakeupId: Id<"chatWakeups">,
  fireAt: number,
): Promise<void> {
  await ctx.db.patch(wakeupId, { status: "armed", fireAt });
  await ctx.scheduler.runAfter(
    Math.max(0, fireAt - Date.now()),
    internal._wakeups.wakeups.fire,
    { wakeupId, fireAt },
  );
}

async function drop(
  ctx: MutationCtx,
  wakeupId: Id<"chatWakeups">,
  reason: string,
): Promise<void> {
  await ctx.db.patch(wakeupId, { status: "dropped", reason });
}

/** The PR merged: start each waiting wake's delay. */
export async function armMergeWakeups(
  ctx: MutationCtx,
  prUrl: string,
): Promise<void> {
  const waiting = await ctx.db
    .query("chatWakeups")
    .withIndex("by_pr_url_and_status", (q) =>
      q.eq("trigger.prUrl", prUrl).eq("status", "pending"),
    )
    .collect();
  const now = Date.now();
  for (const wakeup of waiting) {
    if (wakeup.trigger.kind !== "merge") continue;
    await arm(ctx, wakeup._id, now + wakeup.trigger.delayMs);
  }
}

/** The PR closed without merging: its waiting wakes can never fire. */
export async function dropMergeWakeups(
  ctx: MutationCtx,
  prUrl: string,
): Promise<void> {
  const waiting = await ctx.db
    .query("chatWakeups")
    .withIndex("by_pr_url_and_status", (q) =>
      q.eq("trigger.prUrl", prUrl).eq("status", "pending"),
    )
    .collect();
  for (const wakeup of waiting) {
    await drop(ctx, wakeup._id, "The pull request closed without merging.");
  }
}

const wakeupSummaryValidator = v.object({
  wakeupId: v.id("chatWakeups"),
  status: v.union(v.literal("pending"), v.literal("armed")),
  prompt: v.string(),
  prUrl: v.optional(v.string()),
  delayMs: v.optional(v.number()),
  fireAt: v.optional(v.number()),
});

type WakeupSummary = Infer<typeof wakeupSummaryValidator>;

function summarize(wakeup: Wakeup): WakeupSummary | null {
  if (wakeup.status !== "pending" && wakeup.status !== "armed") return null;
  return {
    wakeupId: wakeup._id,
    status: wakeup.status,
    prompt: wakeup.prompt,
    ...(wakeup.trigger.kind === "merge"
      ? { prUrl: wakeup.trigger.prUrl, delayMs: wakeup.trigger.delayMs }
      : {}),
    ...(wakeup.fireAt === undefined ? {} : { fireAt: wakeup.fireAt }),
  };
}

const scheduleReplyValidator = v.union(
  v.object({ ok: v.literal(true), wakeup: wakeupSummaryValidator }),
  v.object({ ok: v.literal(false), error: v.string() }),
);

/**
 * Stores a new wake on the calling chat. A time wake, or a merge wake on a PR
 * that already merged, is armed at once; any other merge wake waits.
 */
export const schedule = internalMutation({
  args: {
    kind: chatKindValidator,
    id: v.string(),
    /** Session only: the calling chat inside the session. */
    sessionChatId: v.optional(v.string()),
    prompt: v.string(),
    trigger: v.union(
      v.object({ kind: v.literal("time"), at: v.number() }),
      v.object({
        kind: v.literal("merge"),
        prUrl: v.optional(v.string()),
        delayMs: v.number(),
      }),
    ),
  },
  returns: scheduleReplyValidator,
  handler: async (ctx, args): Promise<Infer<typeof scheduleReplyValidator>> => {
    const owner = ownerFor(ctx, args.kind, args.id);
    if (owner === null) return { ok: false, error: "Unknown chat." };
    const now = Date.now();
    const prompt = args.prompt.trim();
    const existing = await listOwnerWakeups(ctx.db, owner);
    const error = wakeupLimitError({
      pending: existing.filter((row) => LIVE_STATUSES.has(row.status)).length,
      total: existing.length,
      delayMs:
        args.trigger.kind === "time"
          ? args.trigger.at - now
          : args.trigger.delayMs,
      promptChars: prompt.length,
    });
    if (error !== null) return { ok: false, error };

    const sessionChatId =
      owner.kind === "session" && args.sessionChatId !== undefined
        ? (ctx.db.normalizeId("sessionChats", args.sessionChatId) ?? undefined)
        : undefined;
    const base = { owner, sessionChatId, prompt, createdAt: now };

    let wakeupId: Id<"chatWakeups">;
    if (args.trigger.kind === "time") {
      wakeupId = await ctx.db.insert("chatWakeups", {
        ...base,
        trigger: { kind: "time" },
        status: "armed",
      });
      await arm(ctx, wakeupId, args.trigger.at);
    } else {
      const { prUrl, delayMs } = args.trigger;
      const rows = await listOwnerPullRequests(ctx.db, owner);
      // Omitted: the chat's main PR, as for `watch_pull_request`.
      const pr =
        prUrl === undefined
          ? (rows.find((row) => row.primary) ?? rows[0])
          : rows.find((row) => samePrUrl(row.prUrl, prUrl));
      if (pr === undefined) {
        return {
          ok: false,
          error:
            prUrl === undefined
              ? "This chat has no pull request to wait on."
              : "That pull request is not linked to this chat. Only this chat's own pull requests can trigger a wake-up.",
        };
      }
      if (pr.state === "closed") {
        return {
          ok: false,
          error: `Pull request #${pr.prNumber} closed without merging; it will never merge.`,
        };
      }
      wakeupId = await ctx.db.insert("chatWakeups", {
        ...base,
        trigger: { kind: "merge", prUrl: pr.prUrl, delayMs },
        status: "pending",
      });
      // Already merged: count the delay from now.
      if (pr.state === "merged") await arm(ctx, wakeupId, now + delayMs);
    }
    const stored = await ctx.db.get(wakeupId);
    const wakeup = stored === null ? null : summarize(stored);
    if (wakeup === null) return { ok: false, error: "Could not store it." };
    return { ok: true, wakeup };
  },
});

/** The chat's pending and armed wakes, oldest first. */
export const listForChat = internalQuery({
  args: { kind: chatKindValidator, id: v.string() },
  returns: v.array(wakeupSummaryValidator),
  handler: async (ctx, args) => {
    const owner = ownerFor(ctx, args.kind, args.id);
    if (owner === null) return [];
    const rows = await listOwnerWakeups(ctx.db, owner);
    return rows.flatMap((row) => summarize(row) ?? []);
  },
});

/** Cancels one of the chat's live wakes, or all of them when none is named. */
export const cancelForChat = internalMutation({
  args: {
    kind: chatKindValidator,
    id: v.string(),
    wakeupId: v.optional(v.string()),
  },
  returns: v.array(v.id("chatWakeups")),
  handler: async (ctx, args) => {
    const owner = ownerFor(ctx, args.kind, args.id);
    if (owner === null) return [];
    const live = (await listOwnerWakeups(ctx.db, owner)).filter(
      (row) =>
        LIVE_STATUSES.has(row.status) &&
        (args.wakeupId === undefined || row._id === args.wakeupId),
    );
    for (const row of live) {
      await ctx.db.patch(row._id, { status: "cancelled" });
    }
    return live.map((row) => row._id);
  },
});

/**
 * Takes an armed wake when its time comes. Drops it when the PR row is gone
 * (a foreign tip-copy merge detaches it) or the chat is gone; unarchives a
 * merged session so the run is visible. Returns what `fire` sends, or null.
 */
export const claimFire = internalMutation({
  args: { wakeupId: v.id("chatWakeups"), fireAt: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      message: v.string(),
      target: v.object({
        kind: chatKindValidator,
        id: v.string(),
        chat: v.optional(v.string()),
        clerkUserId: v.string(),
      }),
    }),
  ),
  handler: async (ctx, { wakeupId, fireAt }) => {
    const wakeup = await ctx.db.get(wakeupId);
    if (!wakeup || wakeup.status !== "armed" || wakeup.fireAt !== fireAt) {
      return null;
    }
    const now = Date.now();
    let merged: { prUrl: string; prNumber: number; delayMs: number } | undefined;
    if (wakeup.trigger.kind === "merge") {
      const pr = await findPullRequestByUrl(ctx.db, wakeup.trigger.prUrl);
      if (pr === null || pr.state !== "merged") {
        await drop(ctx, wakeupId, "The pull request is no longer merged into this chat.");
        return null;
      }
      merged = {
        prUrl: pr.prUrl,
        prNumber: pr.prNumber,
        delayMs: wakeup.trigger.delayMs,
      };
    }
    const { owner } = wakeup;
    if (owner.kind === "session") {
      const session = await ctx.db.get(owner.sessionId);
      if (session && !isEntityDeleted(session) && session.archived === true) {
        await unarchiveSession(ctx, session._id);
      }
    }
    const target = await wakeTarget(ctx, owner, wakeup.sessionChatId);
    if (target === null) {
      await drop(ctx, wakeupId, "The chat was closed or deleted.");
      return null;
    }
    await ctx.db.patch(wakeupId, { status: "fired" });
    return {
      target,
      message: buildWakeupMessage({
        prompt: wakeup.prompt,
        createdAt: wakeup.createdAt,
        now,
        ...(merged === undefined ? {} : { merged }),
      }),
    };
  },
});

export const markSendFailed = internalMutation({
  args: { wakeupId: v.id("chatWakeups"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { wakeupId, reason }) => {
    await drop(ctx, wakeupId, reason);
    return null;
  },
});

/** Sends one armed wake into its chat: starts a turn, or queues behind one. */
export const fire = internalAction({
  args: { wakeupId: v.id("chatWakeups"), fireAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(
      internal._wakeups.wakeups.claimFire,
      args,
    );
    if (claimed === null) return null;
    const { target, message } = claimed;
    try {
      await ctx.runAction(internal.mcp.nodeActions.orchestratorSendMessage, {
        clerkUserId: target.clerkUserId,
        kind: target.kind,
        id: target.id,
        ...(target.chat === undefined ? {} : { chat: target.chat }),
        message,
        sentViaOrchestrator: true,
      });
    } catch (error) {
      // First line only: action errors carry a stack trace after it.
      const reason = (
        error instanceof Error ? error.message : String(error)
      ).split("\n")[0];
      console.error(`[wakeups] send failed for ${args.wakeupId}: ${reason}`);
      await ctx.runMutation(internal._wakeups.wakeups.markSendFailed, {
        wakeupId: args.wakeupId,
        reason,
      });
    }
    return null;
  },
});
