import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authMutation, authQuery, hasTeamAccess } from "./functions";
import { roleUserValidator } from "./validators";

const profileReturn = v.object({
  role: v.union(roleUserValidator, v.null()),
  headline: v.string(),
  owns: v.string(),
  askMeAbout: v.string(),
});

const directoryMember = v.object({
  userId: v.id("users"),
  name: v.string(),
  role: v.union(roleUserValidator, v.null()),
  headline: v.string(),
  owns: v.string(),
  askMeAbout: v.string(),
});

function displayName(user: {
  fullName?: string;
  firstName?: string;
  email?: string;
}): string {
  return user.fullName || user.firstName || user.email || "Teammate";
}

async function firstMembershipTeamId(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Id<"teams"> | null> {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (memberships.length === 0) return null;
  for (const row of memberships) {
    const team = await ctx.db.get(row.teamId);
    if (team && team.isPersonal !== true) return row.teamId;
  }
  return memberships[0].teamId;
}

/** Current user's role plus work-profile text (from their first real team). */
export const getMine = authQuery({
  args: {},
  returns: profileReturn,
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    const teamId = await firstMembershipTeamId(ctx, ctx.userId);
    const profile = teamId
      ? await ctx.db
          .query("workProfiles")
          .withIndex("by_team_and_user", (q) =>
            q.eq("teamId", teamId).eq("userId", ctx.userId),
          )
          .first()
      : null;
    return {
      role: profile?.role ?? user?.role ?? null,
      headline: profile?.headline ?? "",
      owns: profile?.owns ?? "",
      askMeAbout: profile?.askMeAbout ?? "",
    };
  },
});

/**
 * Writes the caller's work profile to every team they belong to, and mirrors
 * `role` onto `users` so the existing personalisation picker stays in sync.
 */
export const upsertMine = authMutation({
  args: {
    role: v.optional(v.union(roleUserValidator, v.null())),
    headline: v.string(),
    owns: v.string(),
    askMeAbout: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const headline = args.headline.trim();
    const owns = args.owns.trim();
    const askMeAbout = args.askMeAbout.trim();
    if (args.role !== undefined) {
      await ctx.db.patch(ctx.userId, { role: args.role ?? undefined });
    }
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    const now = Date.now();
    const role =
      args.role === undefined
        ? (await ctx.db.get(ctx.userId))?.role
        : (args.role ?? undefined);
    for (const membership of memberships) {
      const existing = await ctx.db
        .query("workProfiles")
        .withIndex("by_team_and_user", (q) =>
          q.eq("teamId", membership.teamId).eq("userId", ctx.userId),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          role,
          headline,
          owns,
          askMeAbout,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("workProfiles", {
          teamId: membership.teamId,
          userId: ctx.userId,
          role,
          headline,
          owns,
          askMeAbout,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

/** Teammates on a team the caller belongs to — routing directory for the UI. */
export const listForTeam = authQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(directoryMember),
  handler: async (ctx, args) => {
    if (!(await hasTeamAccess(ctx.db, args.teamId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    return listDirectoryForTeam(ctx, args.teamId);
  },
});

export async function listDirectoryForTeam(
  ctx: QueryCtx,
  teamId: Id<"teams">,
): Promise<
  Array<{
    userId: Id<"users">;
    name: string;
    role: "business" | "dev" | "designer" | null;
    headline: string;
    owns: string;
    askMeAbout: string;
  }>
> {
  const members = await ctx.db
    .query("teamMembers")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();
  const out = [];
  for (const member of members) {
    const user = await ctx.db.get(member.userId);
    if (!user) continue;
    const profile = await ctx.db
      .query("workProfiles")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", teamId).eq("userId", member.userId),
      )
      .first();
    out.push({
      userId: member.userId,
      name: displayName(user),
      role: profile?.role ?? user.role ?? null,
      headline: profile?.headline ?? "",
      owns: profile?.owns ?? "",
      askMeAbout: profile?.askMeAbout ?? "",
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** MCP roster: every non-personal team the agent user belongs to. */
export const listForAgent = internalQuery({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      teamId: v.id("teams"),
      teamName: v.string(),
      members: v.array(directoryMember),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teams = [];
    for (const membership of memberships) {
      const team = await ctx.db.get(membership.teamId);
      if (!team || team.isPersonal === true) continue;
      teams.push({
        teamId: team._id,
        teamName: team.name,
        members: await listDirectoryForTeam(ctx, team._id),
      });
    }
    return teams;
  },
});
