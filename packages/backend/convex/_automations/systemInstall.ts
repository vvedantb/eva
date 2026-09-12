import { v } from "convex/values";
import { internal } from "../_generated/api";
import { authQuery, authMutation, hasRepoAccess } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";
import { allocateNumId, filterActiveEntities } from "../numId";
import { safeDeleteCron, safeReplaceCron } from "../cronManager";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getSystemAutomation, SYSTEM_AUTOMATIONS } from "./systemAutomations";

/** Catalog entry joined with this repo's install state, for the Automations Hub. */
const systemAutomationEntry = v.object({
  key: v.string(),
  title: v.string(),
  /** One-line card copy; the prompt itself is only shown once installed. */
  blurb: v.string(),
  /** This install's schedule, or the catalog default before it is installed. */
  cronSchedule: v.string(),
  /** True when the automation reports without touching code. */
  readOnly: v.boolean(),
  /** True while an install row exists for this repo (soft-deleted ones don't count). */
  installed: v.boolean(),
  enabled: v.boolean(),
  sendEmail: v.boolean(),
  /** Per-repo URL id of the install row, or null when not installed. */
  numId: v.union(v.number(), v.null()),
});

/**
 * Finds this repo's install row for a catalog key. Returns soft-deleted rows
 * too, so reinstalling revives the original row and keeps its run history.
 */
async function findInstall(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  key: string,
): Promise<Doc<"automations"> | null> {
  const rows = await db
    .query("automations")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .collect();
  const matches = rows.filter((row) => row.systemKey === key);
  return (
    filterActiveEntities(matches)[0] ??
    matches.find((row) => row.deletedAt !== undefined) ??
    null
  );
}

/** Lists the hardcoded system automations with this repo's install state. */
export const listSystemAutomations = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(systemAutomationEntry),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }
    const rows = filterActiveEntities(
      await ctx.db
        .query("automations")
        .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
        .collect(),
    );

    return SYSTEM_AUTOMATIONS.map((entry) => {
      const install = rows.find((row) => row.systemKey === entry.key);
      return {
        key: entry.key,
        title: entry.title,
        blurb: entry.blurb,
        cronSchedule: install?.cronSchedule || entry.defaultCronSchedule,
        readOnly: entry.readOnly,
        installed: install !== undefined,
        enabled: install?.enabled === true,
        sendEmail: install?.sendEmail === true,
        numId: install?.numId ?? null,
      };
    });
  },
});

/** Resolves the repo + catalog entry for a Hub mutation, or throws. */
async function authorizeInstall(
  db: DatabaseWriter,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
  key: string,
) {
  if (!(await hasRepoAccess(db, repoId, userId))) {
    throw new Error("Not authorized");
  }
  const entry = getSystemAutomation(key);
  if (!entry) throw new Error("Unknown system automation");
  return entry;
}

/**
 * Installs a system automation into a repo: creates the install row (or revives
 * a previously uninstalled one, keeping its run history and its schedule),
 * switches it on and registers its cron like any other automation.
 */
export const installSystemAutomation = authMutation({
  args: { repoId: v.id("githubRepos"), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const entry = await authorizeInstall(
      ctx.db,
      ctx.userId,
      args.repoId,
      args.key,
    );
    const now = Date.now();
    const existing = await findInstall(ctx.db, args.repoId, args.key);

    // Content fields stay empty: the catalog supplies title and prompt on read.
    // `title` is denormalised only as a fallback if the entry is removed. The
    // schedule is real, seeded from the catalog and then the user's to change.
    const id =
      existing?._id ??
      (await ctx.db.insert("automations", {
        repoId: args.repoId,
        systemKey: entry.key,
        title: entry.title,
        description: "",
        cronSchedule: entry.defaultCronSchedule,
        enabled: true,
        createdBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
        numId: await allocateNumId(ctx.db, args.repoId, "automations"),
      }));
    const cronSchedule = existing?.cronSchedule || entry.defaultCronSchedule;

    await ctx.db.patch(id, {
      deletedAt: undefined,
      enabled: true,
      cronSchedule,
      updatedAt: now,
      cronJobId: await safeReplaceCron(ctx, {
        name: `automation-${String(id)}`,
        cronspec: cronSchedule,
        handler: internal.automations.triggerAutomation,
        args: { automationId: id },
      }),
    });
    return null;
  },
});

/**
 * Uninstalls a system automation from a repo: unregisters its cron and
 * soft-deletes the install row, so it drops out of the sidebar. Reinstalling
 * later brings the same row back — runs, schedule and all.
 */
export const uninstallSystemAutomation = authMutation({
  args: { repoId: v.id("githubRepos"), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await authorizeInstall(ctx.db, ctx.userId, args.repoId, args.key);
    const install = await findInstall(ctx.db, args.repoId, args.key);
    if (!install || install.deletedAt !== undefined) return null;

    await safeDeleteCron(ctx, `automation-${String(install._id)}`);

    const now = Date.now();
    await ctx.db.patch(install._id, {
      enabled: false,
      cronJobId: undefined,
      deletedAt: now,
      updatedAt: now,
    });
    return null;
  },
});
