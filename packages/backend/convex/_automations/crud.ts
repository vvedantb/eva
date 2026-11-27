import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  aiModelValidator,
  automationFields,
  automationTriggerValidator,
} from "../validators";
import { authQuery, authMutation, hasRepoAccess } from "../functions";
import { allocateNumId, entityVisible } from "../numId";
import { safeDeleteCron, safeReplaceCron } from "../cronManager";
import type { Doc } from "../_generated/dataModel";
import {
  getAutomationWithAccess,
  listAutomationsForRepo,
  resolveAutomationRepoId,
} from "./helpers";
import { resolveCanonicalRepoId } from "../_githubRepos/helpers";
import { assertProviderAccountUsableBy } from "../_userProviderAccounts/defaults";
import { CHANGELOG_AUTOMATION_TITLE } from "../_changelog/entry";
import {
  automationCronspec,
  getSystemAutomation,
  resolveAutomationDoc,
} from "./systemAutomations";
import {
  USER_REPO_EVENTS,
  type AutomationTrigger,
  type RepoEventKind,
} from "../_automationEvents/labels";

/** Return validator for a full automation document. */
const automationDoc = v.object({
  _id: v.id("automations"),
  _creationTime: v.number(),
  ...automationFields,
});

/** Hides soft-deleted rows and applies the system-automation catalog overlay. */
function visibleAutomation(
  automation: Doc<"automations"> | null,
): Doc<"automations"> | null {
  const visible = entityVisible(automation);
  return visible ? resolveAutomationDoc(visible) : null;
}

/**
 * The weekly changelog title is reserved: `changelog.ts` finds that automation
 * by title and it broadcasts to every user, so no other automation may take it.
 */
function assertTitleNotReserved(title: string): void {
  if (title.trim() === CHANGELOG_AUTOMATION_TITLE) {
    throw new Error("That automation title is reserved");
  }
}

/** Lists all automations for a given repository. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(automationDoc),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }
    return await listAutomationsForRepo(ctx.db, args.repoId);
  },
});

/** Returns a single automation by ID. */
export const get = authQuery({
  args: { id: v.id("automations") },
  returns: v.union(automationDoc, v.null()),
  handler: async (ctx, args) => {
    const automation = await ctx.db.get(args.id);
    if (!automation) return null;
    if (!(await hasRepoAccess(ctx.db, automation.repoId, ctx.userId))) {
      return null;
    }
    return visibleAutomation(automation);
  },
});

/** Resolves an automation by per-repo numeric id (URL segment). */
export const getByNumId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    numId: v.number(),
  },
  returns: v.union(automationDoc, v.null()),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return null;
    }
    const automation = await ctx.db
      .query("automations")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", args.repoId).eq("numId", args.numId),
      )
      .first();
    if (automation) return visibleAutomation(automation);

    // Shared automations are stored on the canonical (parent) repo, so a
    // child-app lookup misses them; mirror listAutomationsForRepo's fallback.
    const canonicalId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    if (canonicalId === args.repoId) return null;
    const sharedAutomation = await ctx.db
      .query("automations")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", canonicalId).eq("numId", args.numId),
      )
      .first();
    if (!sharedAutomation || sharedAutomation.shared !== true) return null;
    return visibleAutomation(sharedAutomation);
  },
});

/** Creates a new automation for a repository with default disabled state. */
export const create = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    title: v.string(),
  },
  returns: v.id("automations"),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    assertTitleNotReserved(args.title);
    const now = Date.now();
    const numId = await allocateNumId(ctx.db, args.repoId, "automations");
    return await ctx.db.insert("automations", {
      repoId: args.repoId,
      title: args.title,
      description: "",
      cronSchedule: "",
      enabled: false,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
      numId,
    });
  },
});

function sameEvents(
  a: ReadonlyArray<RepoEventKind>,
  b: ReadonlyArray<RepoEventKind>,
): boolean {
  return a.length === b.length && a.every((event) => b.includes(event));
}

/** A user automation needs at least one event, all of them user-pickable. */
function assertUserTrigger(trigger: AutomationTrigger): void {
  if (trigger.kind !== "event") return;
  if (trigger.events.length === 0) {
    throw new Error("Switch on at least one event");
  }
  if (!trigger.events.every((event) => USER_REPO_EVENTS.includes(event))) {
    throw new Error("That event is only for Eva's built-in automations");
  }
}

/** Updates automation fields and syncs the cron schedule (re-registers or deletes as needed). */
export const update = authMutation({
  args: {
    id: v.id("automations"),
    contextRepoId: v.optional(v.id("githubRepos")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    cronSchedule: v.optional(v.string()),
    trigger: v.optional(automationTriggerValidator),
    model: v.optional(aiModelValidator),
    /** Null switches back to the team credential. */
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
    enabled: v.optional(v.boolean()),
    readOnly: v.optional(v.boolean()),
    actionsEnabled: v.optional(v.boolean()),
    shared: v.optional(v.boolean()),
    sendEmail: v.optional(v.boolean()),
    autoStartTasks: v.optional(v.boolean()),
    emailAutoSend: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const automation = await getAutomationWithAccess(
      ctx.db,
      args.id,
      ctx.userId,
    );

    // A system automation's definition is code-owned, but everything else —
    // schedule, model, enabled, email — belongs to the install and takes the
    // path below. `model` is not part of SystemAutomationDefinition, so it is
    // the user's to pick here exactly as it is on a normal automation.
    if (automation.systemKey !== undefined) {
      const editsDefinition =
        args.title !== undefined ||
        args.description !== undefined ||
        args.readOnly !== undefined ||
        args.actionsEnabled !== undefined ||
        args.shared !== undefined;
      if (editsDefinition) {
        throw new Error(
          "A system automation's title, prompt and mode are managed by eva",
        );
      }
      // Only an event preset's label is the install's to change.
      const catalogTrigger = getSystemAutomation(automation.systemKey)?.trigger;
      if (
        args.trigger !== undefined &&
        (catalogTrigger === undefined ||
          catalogTrigger.kind !== args.trigger.kind ||
          (catalogTrigger.kind === "event" &&
            args.trigger.kind === "event" &&
            !sameEvents(catalogTrigger.events, args.trigger.events)))
      ) {
        throw new Error("A system automation's trigger is managed by eva");
      }
    } else if (args.trigger !== undefined) {
      assertUserTrigger(args.trigger);
    }

    // The changelog automation itself may keep (re-save) its own title.
    if (args.title !== undefined && args.title !== automation.title) {
      assertTitleNotReserved(args.title);
    }

    const patch: Partial<Doc<"automations">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.cronSchedule !== undefined) patch.cronSchedule = args.cronSchedule;
    if (args.trigger !== undefined) patch.trigger = args.trigger;
    if (args.model !== undefined) patch.model = args.model;
    // Runs use the creator's credentials whoever edits, so the account must
    // be one the creator may run on: their own, or shared by a teammate.
    if (args.providerAccountId !== undefined) {
      patch.providerAccountId = await assertProviderAccountUsableBy(
        ctx.db,
        args.providerAccountId,
        automation.createdBy,
      );
    }
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.readOnly !== undefined) patch.readOnly = args.readOnly;
    if (args.actionsEnabled !== undefined)
      patch.actionsEnabled = args.actionsEnabled;
    if (args.sendEmail !== undefined) patch.sendEmail = args.sendEmail;
    if (args.autoStartTasks !== undefined) {
      patch.autoStartTasks = args.autoStartTasks;
    }
    if (args.emailAutoSend !== undefined)
      patch.emailAutoSend = args.emailAutoSend;

    if (args.shared !== undefined) {
      if (args.contextRepoId === undefined) {
        throw new Error("contextRepoId is required when updating shared");
      }
      if (!(await hasRepoAccess(ctx.db, args.contextRepoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
      patch.shared = args.shared;
      patch.repoId = await resolveAutomationRepoId(
        ctx.db,
        args.contextRepoId,
        args.shared,
      );
    }

    const cronName = `automation-${String(args.id)}`;
    patch.cronJobId = await safeReplaceCron(ctx, {
      name: cronName,
      cronspec: automationCronspec({ ...automation, ...patch }),
      handler: internal.automations.triggerAutomation,
      args: { automationId: args.id },
    });

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

/** Soft-deletes an automation: stops cron scheduling but keeps the row and runs. */
export const remove = authMutation({
  args: { id: v.id("automations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const automation = await ctx.db.get(args.id);
    if (!automation) return null;
    if (!(await hasRepoAccess(ctx.db, automation.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    // System rows delete the same way: a soft delete is the uninstall, and
    // reinstalling from the Hub revives this row with its run history intact.
    const cronName = `automation-${String(args.id)}`;
    await safeDeleteCron(ctx, cronName);

    await ctx.db.patch(args.id, {
      enabled: false,
      cronJobId: undefined,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});
