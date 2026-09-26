import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { filterActiveEntities } from "../numId";
import { findChatForPrUrl } from "../_github/evaPrOwnership";
import {
  automationAction,
  automationTrigger,
  resolveAutomationDoc,
} from "../_automations/systemAutomations";
import { insertAutomationTask } from "../_automations/findings";
import {
  EVENT_DEBOUNCE_MS,
  repoEventKey,
  repoEventTargetUrl,
  repoEventValidator,
  triggerMatchesEvent,
  type RepoEvent,
} from "./events";
import { MAX_CI_FIX_ATTEMPTS } from "./messages";

/** Successful deliveries this automation has made for one PR or issue. */
async function successfulDeliveries(
  ctx: MutationCtx,
  automation: Doc<"automations">,
  targetUrl: string,
): Promise<Array<Doc<"automationRuns">>> {
  const runs = await ctx.db
    .query("automationRuns")
    .withIndex("by_automation_and_targetUrl", (q) =>
      q.eq("automationId", automation._id).eq("targetUrl", targetUrl),
    )
    .collect();
  return runs.filter((run) => run.status === "success");
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
): Promise<boolean> {
  const previous = await ctx.db
    .query("automationRuns")
    .withIndex("by_automation_and_eventKey", (q) =>
      q.eq("automationId", automation._id).eq("eventKey", eventKey),
    )
    .order("desc")
    .first();
  // A run still waiting out its debounce absorbs this webhook.
  if (previous?.status === "queued") return false;
  // One task per issue: re-adding the label must not open a second one.
  if (
    event.kind === "issue_labeled" &&
    previous !== null &&
    previous.status !== "error" &&
    previous.status !== "cancelled"
  ) {
    return false;
  }
  // The same commit failing twice (a re-run) is still one attempt.
  if (event.kind === "ci_failed" && previous?.status === "success") {
    return false;
  }

  if (automationAction(automation) !== "route_to_pr_chat") return true;
  if (event.kind !== "ci_failed" && event.kind !== "pr_feedback") return false;
  if ((await findChatForPrUrl(ctx, event.prUrl)) === null) return false;
  if (event.kind === "ci_failed") {
    const delivered = await successfulDeliveries(ctx, automation, event.prUrl);
    // Attempt MAX + 1 is the one-off "stopping here" note, then silence.
    return delivered.length <= MAX_CI_FIX_ATTEMPTS;
  }
  return true;
}

/**
 * Fans one repo event out to every enabled automation it triggers, across all
 * app rows of the repo. Each match gets a queued run that the flush action
 * picks up after the event's debounce.
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
    const eventKey = repoEventKey(event);
    const now = Date.now();

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
        if (!triggerMatchesEvent(automationTrigger(automation), event)) {
          continue;
        }
        if (!(await shouldQueue(ctx, automation, event, eventKey))) continue;

        const runId = await ctx.db.insert("automationRuns", {
          automationId: automation._id,
          repoId: automation.repoId,
          status: "queued",
          startedAt: now,
          acknowledged: false,
          eventKind: event.kind,
          eventKey,
          targetUrl: repoEventTargetUrl(event),
        });
        await ctx.scheduler.runAfter(
          EVENT_DEBOUNCE_MS[event.kind],
          internal._automationEvents.flush.flush,
          { runId, event },
        );
      }
    }
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
      /** Successful earlier deliveries for this PR or issue. */
      deliveries: v.number(),
      lastDeliveredAt: v.union(v.null(), v.number()),
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

    const chat =
      run.targetUrl === undefined
        ? null
        : await findChatForPrUrl(ctx, run.targetUrl);
    const chatUser = chat ? await ctx.db.get(chat.userId) : null;

    const deliveries =
      run.targetUrl === undefined
        ? []
        : (
            await ctx.db
              .query("automationRuns")
              .withIndex("by_automation_and_targetUrl", (q) =>
                q
                  .eq("automationId", automation._id)
                  .eq("targetUrl", run.targetUrl),
              )
              .collect()
          ).filter((other) => other.status === "success");
    const lastDeliveredAt = deliveries.reduce<number | null>(
      (latest, other) =>
        Math.max(latest ?? 0, other.finishedAt ?? other.startedAt),
      null,
    );

    return {
      action: automationAction(automation),
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
      deliveries: deliveries.length,
      lastDeliveredAt,
    };
  },
});

/**
 * Creates the quick task for a labelled issue and starts it, acting as the
 * automation's owner. Returns null when the run was already settled.
 */
export const createTaskFromIssue = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    title: v.string(),
    description: v.string(),
  },
  returns: v.union(v.null(), v.object({ taskId: v.id("agentTasks") })),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "queued") return null;
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
    await ctx.scheduler.runAfter(0, internal.automations.autoStartTask, {
      taskId,
      userId: automation.createdBy,
    });
    await ctx.db.patch(args.runId, {
      resultSummary: `Created quick task #${numId}`,
    });
    return { taskId };
  },
});
