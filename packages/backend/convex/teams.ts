import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { authQuery, authMutation } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import { teamFields } from "./_validators/tableFields";

/** Team doc fields plus resolved media URLs and membership role for list/get. */
const teamWithLogoValidator = v.object({
  _id: v.id("teams"),
  _creationTime: v.number(),
  ...teamFields,
  logoUrl: v.optional(v.union(v.string(), v.null())),
  backgroundUrl: v.optional(v.union(v.string(), v.null())),
  displayName: v.string(),
  userRole: v.union(v.literal("owner"), v.literal("member")),
});

/** Computes a team's display name, deriving personal-team labels from the current user or owner. */
async function resolveDisplayName(
  ctx: QueryCtx,
  team: Doc<"teams">,
  currentUserId: Id<"users">,
): Promise<string> {
  if (!team.isPersonal) return team.name;
  if (team.createdBy === currentUserId) return "My Team";
  const owner = await ctx.db.get(team.createdBy);
  const ownerName = owner?.firstName ?? owner?.fullName ?? "Unknown";
  return `${ownerName}'s Team`;
}

/** Resolves logo/background storage ids to public URLs for UI rendering. */
async function attachTeamMediaUrls(
  ctx: QueryCtx | MutationCtx,
  team: Doc<"teams">,
): Promise<{ logoUrl: string | null; backgroundUrl: string | null }> {
  return {
    logoUrl: team.logoStorageId
      ? await ctx.storage.getUrl(team.logoStorageId)
      : null,
    backgroundUrl: team.backgroundStorageId
      ? await ctx.storage.getUrl(team.backgroundStorageId)
      : null,
  };
}

/** Throws unless the user is a member of the team (any role). */
async function assertTeamMember(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<void> {
  const membership = await db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
  if (!membership) throw new Error("Not authorized");
}

/** Gets the user's personal team, creating one (with owner membership) if it doesn't exist. */
export const getOrCreatePersonal = internalMutation({
  args: { userId: v.id("users") },
  returns: v.id("teams"),
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_created_by", (q) => q.eq("createdBy", args.userId))
      .collect();

    const personalTeam = teams.find((t) => t.isPersonal === true);
    if (personalTeam) {
      return personalTeam._id;
    }

    const teamId = await ctx.db.insert("teams", {
      name: "Personal",
      createdBy: args.userId,
      createdAt: Date.now(),
      isPersonal: true,
    });

    await ctx.db.insert("teamMembers", {
      teamId,
      userId: args.userId,
      role: "owner",
      joinedAt: Date.now(),
    });

    return teamId;
  },
});

/** Creates a new team and adds the current user as owner. */
export const create = authMutation({
  args: {
    name: v.string(),
  },
  returns: v.id("teams"),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    if (!args.name.trim()) {
      throw new Error("Team name is required");
    }

    const teamId = await ctx.db.insert("teams", {
      name: args.name,
      createdBy: ctx.userId,
      createdAt: Date.now(),
    });

    await ctx.db.insert("teamMembers", {
      teamId,
      userId: ctx.userId,
      role: "owner",
      joinedAt: Date.now(),
    });

    return teamId;
  },
});

/** Lists all teams the current user belongs to, with display names, logos, and user role. */
export const list = authQuery({
  args: {},
  returns: v.array(teamWithLogoValidator),
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    const teams = [];
    for (const membership of memberships) {
      const team = await ctx.db.get(membership.teamId);
      if (team) {
        teams.push({
          ...team,
          ...(await attachTeamMediaUrls(ctx, team)),
          displayName: await resolveDisplayName(ctx, team, ctx.userId),
          userRole: membership.role,
        });
      }
    }

    return teams;
  },
});

/** Fetches a single team by ID, returning null if not found or user isn't a member. */
export const get = authQuery({
  // Accepts a raw string so client route params need no `as Id` cast;
  // normalizeId returns null for anything that is not a valid teams id.
  args: { id: v.string() },
  returns: v.union(teamWithLogoValidator, v.null()),
  handler: async (ctx, args) => {
    const teamId = ctx.db.normalizeId("teams", args.id);
    if (!teamId) return null;

    const team = await ctx.db.get(teamId);
    if (!team) return null;

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", teamId).eq("userId", ctx.userId),
      )
      .first();

    if (!membership) return null;

    return {
      ...team,
      ...(await attachTeamMediaUrls(ctx, team)),
      displayName: await resolveDisplayName(ctx, team, ctx.userId),
      userRole: membership.role,
    };
  },
});

/** Updates team settings (name). Only team owners can update. */
export const update = authMutation({
  args: {
    id: v.id("teams"),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", args.id).eq("userId", ctx.userId),
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only team owners can update team settings");
    }

    const updates: { name?: string } = {};
    if (args.name !== undefined) updates.name = args.name;

    await ctx.db.patch(args.id, updates);
    return null;
  },
});

/** Generates a short-lived upload URL for a team logo (any team member). */
export const generateLogoUploadUrl = authMutation({
  args: { teamId: v.id("teams") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    await assertTeamMember(ctx.db, args.teamId, ctx.userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Sets (or clears with null) a team's logo. Any team member can change it.
 * Deletes the previously stored image so replace/remove does not leave orphans.
 */
export const setLogo = authMutation({
  args: {
    teamId: v.id("teams"),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    await assertTeamMember(ctx.db, args.teamId, ctx.userId);

    const previousId = team.logoStorageId;
    if (previousId && previousId !== args.storageId) {
      await ctx.storage.delete(previousId);
    }

    await ctx.db.patch(args.teamId, {
      logoStorageId: args.storageId ?? undefined,
    });
    return null;
  },
});

/** Generates a short-lived upload URL for a team sidebar background (any member). */
export const generateBackgroundUploadUrl = authMutation({
  args: { teamId: v.id("teams") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    await assertTeamMember(ctx.db, args.teamId, ctx.userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Sets (or clears with null) a team's sidebar background banner.
 * Deletes the previously stored image so replace/remove does not leave orphans.
 */
export const setBackground = authMutation({
  args: {
    teamId: v.id("teams"),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    await assertTeamMember(ctx.db, args.teamId, ctx.userId);

    const previousId = team.backgroundStorageId;
    if (previousId && previousId !== args.storageId) {
      await ctx.storage.delete(previousId);
    }

    await ctx.db.patch(args.teamId, {
      backgroundStorageId: args.storageId ?? undefined,
    });
    return null;
  },
});

/** Deletes a team and cleans up all memberships, repo associations, and env vars. Only owners can delete non-personal teams. */
export const remove = authMutation({
  args: { id: v.id("teams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const team = await ctx.db.get(args.id);
    if (!team) throw new Error("Team not found");

    if (team.isPersonal === true) {
      throw new Error("Cannot delete Personal team");
    }

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", args.id).eq("userId", ctx.userId),
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only team owners can delete the team");
    }

    const allMembers = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.id))
      .collect();
    for (const member of allMembers) {
      await ctx.db.delete(member._id);
    }

    const teamRepos = await ctx.db
      .query("githubRepos")
      .withIndex("by_team", (q) => q.eq("teamId", args.id))
      .collect();
    for (const repo of teamRepos) {
      await ctx.db.patch(repo._id, { teamId: undefined });
    }

    const teamEnvVars = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", args.id))
      .first();
    if (teamEnvVars) {
      await ctx.db.delete(teamEnvVars._id);
    }

    if (team.logoStorageId) {
      await ctx.storage.delete(team.logoStorageId);
    }
    if (team.backgroundStorageId) {
      await ctx.storage.delete(team.backgroundStorageId);
    }

    await ctx.db.delete(args.id);
    return null;
  },
});
