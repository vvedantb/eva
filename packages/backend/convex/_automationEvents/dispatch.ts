import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { filterActiveEntities } from "../numId";
import { findChatForPrUrl, type PrChat } from "../_github/evaPrOwnership";
import {
  automationAction,
  automationTrigger,
  resolveAutomationDoc,
} from "../_automations/systemAutomations";
import { insertAutomationTask } from "../_automations/findings";
import {
  ALERT_DEDUPE_WINDOW_MS,
  ciPassedValidator,
  EVENT_DEBOUNCE_MS,
  repoEventKey,
  repoEventTargetUrl,
  alertValidator,
  repoEventValidator,
  STALE_EVENT_RUN_MS,
  STALE_WAITING_RUN_MS,
  triggerMatchesEvent,
  type RepoEvent,
} from "./events";
import { MAX_CI_FIX_ATTEMPTS } from "./messages";
import { pickOnePerPreset } from "./select";
import { isTerminalRunStatus } from "../_automations/runStatus";

/** Every run an automation made for one PR or issue. */
async function runsForTarget(
  db: DatabaseReader,
  automationId: Id<"automations">,
  targetUrl: string,
): Promise<Array<Doc<"automationRuns">>> {
  return await db
    .query("automationRuns")
    .withIndex("by_automation_and_targetUrl", (q) =>
      q.eq("automationId", automationId).eq("targetUrl", targetUrl),
    )
    .collect();
}

/**
 * CI fix messages sent for a PR since it was last fully green. The "stopping
 * here" note counts too, which is what keeps the PR quiet after it.
 */
function countCiAttempts(runs: ReadonlyArray<Doc<"automationRuns">>): number {
  return runs.filter(
    (run) =>
      run.eventKind === "ci_failed" &&
      run.status === "success" &&
      run.superseded !== true,
  ).length;
}

/**
 * Whether this automation should queue a run for the event. Routing presets
 * only act on PRs Eva opened, and CI auto-fix stops once it has given up.
 */
async function shouldQueue(
  ctx: MutationCtx,
  automation: Doc<"automations">,
  event: RepoEvent,
  eventKey: string,
  chat: PrChat | null,
): Promise<boolean> {
  const sameKey = await ctx.db
    .query("automationRuns")
    .withIndex("by_automation_and_eventKey", (q) =>
      q.eq("automationId", automation._id).eq("eventKey", eventKey),
    )
    .collect();
  // A run still waiting out its debounce absorbs this webhook. One already
  // claimed (`running`) does not: it may have fetched before this happened.
  if (sameKey.some((run) => run.status === "queued")) return false;
  // One task per monitor per window, whatever became of the last one.
  if (event.kind === "production_alert") {
    const since = Date.now() - ALERT_DEDUPE_WINDOW_MS;
    return !sameKey.some((run) => run.startedAt >= since);
  }
  // One task per issue, however often the label comes and goes, and whether
  // or not the run that made it finished cleanly.
  if (event.kind === "issue_labeled") {
    return !sameKey.some(
      (run) => run.createdTaskId !== undefined || run.status === "running",
    );
  }
  // The same commit failing twice (a re-run) is still one attempt.
  if (
    event.kind === "ci_failed" &&
    sameKey.some((run) => run.status === "running" || run.status === "success")
  ) {
    return false;
  }

  if (automationAction(automation) !== "route_to_pr_chat") return true;
  if (event.kind !== "ci_failed" && event.kind !== "pr_feedback") return false;
  if (chat === null) return false;
  if (event.kind === "ci_failed") {
    const runs = await runsForTarget(ctx.db, automation._id, event.prUrl);
    // Attempt MAX + 1 is the one-off "stopping here" note, then silence.
    return countCiAttempts(runs) <= MAX_CI_FIX_ATTEMPTS;
  }
  return true;
}

/**
 * Fans one repo event out to every enabled automation it triggers, across all
 * app rows of the repo, keeping one install per preset. Each pick gets a
 * queued run that the flush action handles after the event's debounce.
 */
export const dispatch = internalMutation({
  args: { event: repoEventValidator },
  returns: v.null(),
  handler: async (ctx, { event }) => {
    const repos = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", event.owner).eq("name", event.name),
      )
      .collect();

    const matched: Array<{
      automation: Doc<"automations">;
      repo: Doc<"githubRepos">;
    }> = [];
    for (const repo of repos) {
      const automations = filterActiveEntities(
        await ctx.db
          .query("automations")
          .withIndex("by_repo_and_enabled", (q) =>
            q.eq("repoId", repo._id).eq("enabled", true),
          )
          .collect(),
      );
      for (const automation of automations) {
        if (triggerMatchesEvent(automationTrigger(automation), event)) {
          matched.push({ automation, repo });
        }
      }
    }
    if (matched.length === 0) return null;

    const chat =
      event.kind === "ci_failed" || event.kind === "pr_feedback"
        ? await findChatForPrUrl(ctx, event.prUrl)
        : null;
    const picks = pickOnePerPreset(
      matched.map(({ automation, repo }) => ({
        automationId: automation._id,
        systemKey: automation.systemKey,
        action: automationAction(automation),
        repoId: repo._id,
        isRootRow: repo.parentRepoId === undefined,
      })),
      chat?.repoId,
    );

    for (const pick of picks) {
      const match = matched.find(
        ({ automation }) => automation._id === pick.automationId,
      );
      if (match === undefined) continue;
      await queueEventRun(ctx, match.automation, event, chat);
    }
    return null;
  },
});

/**
 * Queues one automation's run for an event, unless dedupe says the event is
 * already covered. The flush action handles it after the event's debounce.
 */
async function queueEventRun(
  ctx: MutationCtx,
  automation: Doc<"automations">,
  event: RepoEvent,
  chat: PrChat | null,
): Promise<boolean> {
  const eventKey = repoEventKey(event);
  if (!(await shouldQueue(ctx, automation, event, eventKey, chat))) {
    return false;
  }
  const runId = await ctx.db.insert("automationRuns", {
    automationId: automation._id,
    repoId: automation.repoId,
    status: "queued",
    startedAt: Date.now(),
    acknowledged: false,
    eventKind: event.kind,
    eventKey,
    targetUrl: repoEventTargetUrl(event),
  });
  const debounce = EVENT_DEBOUNCE_MS[event.kind];
  await ctx.scheduler.runAfter(
    debounce,
    internal._automationEvents.flush.flush,
    { runId, event },
  );
  // Backstop: a flush that dies mid-way must not leave the run queued,
  // which would block this PR, issue or monitor for good.
  await ctx.scheduler.runAfter(
    debounce +
      (automationAction(automation) === "run"
        ? STALE_WAITING_RUN_MS
        : STALE_EVENT_RUN_MS),
    internal._automationEvents.dispatch.expireEventRun,
    { runId },
  );
  return true;
}

/**
 * An alert webhook for one automation. Unlike GitHub's, each alert URL names
 * its automation, so there is no fan-out: the secret is checked against that
 * row and the alert is queued there. `secretHash` is null when the caller sent
 * no bearer token; `alert` is null for a monitor resolving.
 */
export const receiveAlert = internalMutation({
  args: {
    automationId: v.string(),
    secretHash: v.union(v.string(), v.null()),
    alert: v.union(alertValidator, v.null()),
  },
  returns: v.union(
    v.literal("queued"),
    v.literal("deduped"),
    v.literal("ignored"),
    v.literal("unauthorized"),
    v.literal("not_found"),
  ),
  handler: async (ctx, { automationId, secretHash, alert }) => {
    const id = ctx.db.normalizeId("automations", automationId);
    const stored = id === null ? null : await ctx.db.get(id);
    if (stored === null || stored.deletedAt !== undefined) return "not_found";
    const trigger = automationTrigger(stored);
    if (trigger.kind !== "event" || trigger.event !== "production_alert") {
      return "not_found";
    }
    // Both sides are SHA-256 hex of the secret, so comparing them leaks
    // nothing a timing attack could use.
    if (
      secretHash === null ||
      stored.alertSecretHash === undefined ||
      stored.alertSecretHash !== secretHash
    ) {
      return "unauthorized";
    }
    // A switched-off automation still answers, so Axiom's test send passes;
    // it simply does nothing.
    if (alert === null || !stored.enabled) return "ignored";
    const repo = await ctx.db.get(stored.repoId);
    if (repo === null) return "not_found";
    const queued = await queueEventRun(
      ctx,
      stored,
      { ...alert, owner: repo.owner, name: repo.name },
      null,
    );
    return queued ? "queued" : "deduped";
  },
});

/** Times out an event run that never settled. Agent workflows settle themselves. */
export const expireEventRun = internalMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.activeWorkflowId !== undefined) return null;
    if (run.status !== "queued" && run.status !== "running") return null;
    await ctx.db.patch(runId, {
      status: "error",
      error: "Timed out before it finished",
      finishedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Moves a queued preset run to `running` so later webhooks queue a fresh run
 * instead of folding into one that may already have fetched from GitHub.
 * False when something else already settled or claimed it.
 */
export const claimEventRun = internalMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.boolean(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "queued") return false;
    await ctx.db.patch(runId, { status: "running" });
    return true;
  },
});

/** Final state of a preset run. Never emails: these are one-line notes. */
export const settleEventRun = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    status: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("cancelled"),
    ),
    message: v.string(),
    eventCursor: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, status, message, eventCursor }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    if (isTerminalRunStatus(run.status)) {
      // Expired or cancelled first: keep that outcome, but still advance the
      // cursor so the next webhook does not redo this work.
      if (eventCursor !== undefined) await ctx.db.patch(runId, { eventCursor });
      return null;
    }
    await ctx.db.patch(runId, {
      status,
      finishedAt: Date.now(),
      ...(status === "error" ? { error: message } : { resultSummary: message }),
      ...(eventCursor === undefined ? {} : { eventCursor }),
    });
    return null;
  },
});

const prChatValidator = v.object({
  kind: v.union(v.literal("session"), v.literal("task"), v.literal("project")),
  id: v.string(),
  numId: v.optional(v.number()),
});

/** Everything the flush action needs, read in one transaction. */
export const getFlushContext = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.union(
    v.null(),
    v.object({
      action: v.union(
        v.literal("run"),
        v.literal("route_to_pr_chat"),
        v.literal("create_task"),
      ),
      instructions: v.string(),
      installationId: v.number(),
      repoOwner: v.string(),
      repoName: v.string(),
      rootDirectory: v.string(),
      runStartedAt: v.number(),
      chat: v.union(v.null(), prChatValidator),
      clerkUserId: v.union(v.null(), v.string()),
      /** CI fix messages already sent since the PR was last green. */
      ciAttempts: v.number(),
      /** GitHub time of the newest review comment already delivered. */
      feedbackCursor: v.union(v.null(), v.number()),
      /** Another run for this PR is mid-flush; wait for its cursor. */
      siblingRunning: v.boolean(),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "queued") return null;
    const stored = await ctx.db.get(run.automationId);
    if (!stored || !stored.enabled || stored.deletedAt !== undefined) {
      return null;
    }
    const repo = await ctx.db.get(stored.repoId);
    if (!repo) return null;
    const automation = resolveAutomationDoc(stored);
    const action = automationAction(automation);

    const chat =
      action === "route_to_pr_chat" && run.targetUrl !== undefined
        ? await findChatForPrUrl(ctx, run.targetUrl)
        : null;
    const chatUser = chat ? await ctx.db.get(chat.userId) : null;

    const siblings =
      action === "route_to_pr_chat" && run.targetUrl !== undefined
        ? await runsForTarget(ctx.db, automation._id, run.targetUrl)
        : [];
    const feedbackCursor = siblings.reduce<number | null>(
      (newest, other) =>
        other.status === "success" && other.eventCursor !== undefined
          ? Math.max(newest ?? 0, other.eventCursor)
          : newest,
      null,
    );

    return {
      action,
      instructions: automation.description,
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      rootDirectory: repo.rootDirectory ?? "",
      runStartedAt: run.startedAt,
      chat: chat
        ? { kind: chat.kind, id: String(chat.id), numId: chat.numId }
        : null,
      clerkUserId: chatUser?.clerkId ?? null,
      ciAttempts: countCiAttempts(siblings),
      feedbackCursor,
      siblingRunning: siblings.some(
        (other) =>
          other._id !== runId &&
          other.status === "running" &&
          other.activeWorkflowId === undefined,
      ),
    };
  },
});

/**
 * Creates the quick task for an event (a labelled issue, an alert), acting as
 * the automation's owner, and starts it unless the install turned that off.
 * The task id is stored first, so nothing that fails afterwards can lead to a
 * second task. Null when the run is not claimed.
 */
export const createTaskForEvent = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    title: v.string(),
    description: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({ taskId: v.id("agentTasks"), numId: v.number() }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running" || run.createdTaskId !== undefined) {
      return null;
    }
    const automation = await ctx.db.get(run.automationId);
    const repo = automation ? await ctx.db.get(automation.repoId) : null;
    if (!automation || !repo) return null;

    const { taskId, numId } = await insertAutomationTask(ctx, {
      automation,
      repo,
      userId: automation.createdBy,
      title: args.title,
      description: args.description,
    });
    await ctx.db.patch(args.runId, { createdTaskId: taskId });
    if (automation.autoStartTasks !== false) {
      await ctx.scheduler.runAfter(0, internal.automations.autoStartTask, {
        taskId,
        userId: automation.createdBy,
      });
    }
    return { taskId, numId };
  },
});

/**
 * A check suite passed on a PR. If CI auto-fix has spent attempts on it, ask
 * GitHub whether the whole commit is now green; only then does the cap reset.
 * One passing suite alone proves nothing while another is still red.
 */
export const noteCiPassed = internalMutation({
  args: { passed: ciPassedValidator },
  returns: v.null(),
  handler: async (ctx, { passed }) => {
    const repos = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", passed.owner).eq("name", passed.name),
      )
      .collect();
    const automationIds: Array<Id<"automations">> = [];
    let installationId: number | null = null;
    for (const repo of repos) {
      const automations = await ctx.db
        .query("automations")
        .withIndex("by_repo_and_enabled", (q) =>
          q.eq("repoId", repo._id).eq("enabled", true),
        )
        .collect();
      for (const automation of automations) {
        const trigger = automationTrigger(automation);
        if (trigger.kind !== "event" || trigger.event !== "ci_failed") continue;
        const runs = await runsForTarget(ctx.db, automation._id, passed.prUrl);
        if (countCiAttempts(runs) === 0) continue;
        automationIds.push(automation._id);
        installationId = repo.installationId;
      }
    }
    if (installationId === null) return null;
    await ctx.scheduler.runAfter(
      0,
      internal._automationEvents.flush.confirmCiGreen,
      { passed, automationIds, installationId },
    );
    return null;
  },
});

/** Stops past CI fix attempts counting toward the cap, once a PR is green. */
export const resetCiAttempts = internalMutation({
  args: {
    automationIds: v.array(v.id("automations")),
    prUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { automationIds, prUrl }) => {
    for (const automationId of automationIds) {
      for (const run of await runsForTarget(ctx.db, automationId, prUrl)) {
        if (run.eventKind === "ci_failed" && run.superseded !== true) {
          await ctx.db.patch(run._id, { superseded: true });
        }
      }
    }
    return null;
  },
});
