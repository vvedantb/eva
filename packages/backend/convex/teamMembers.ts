import type { GenericDatabaseReader } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { authQuery, authMutation, hasRepoAccess } from "./functions";
import { getUserPresenceRow, mergeLastSeen } from "./_users/lastSeen";
import { teamMemberRoleValidator } from "./validators";

/** Fetches a user's membership row for a team, or null if they aren't a member. */
function getTeamMembership(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<Doc<"teamMembers"> | null> {
  return db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
}

/** Throws with the given message unless the user is an owner of the team. */
async function requireTeamOwner(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
  errorMessage: string,
): Promise<void> {
  const membership = await getTeamMembership(db, teamId, userId);
  if (!membership || membership.role !== "owner") {
    throw new Error(errorMessage);
  }
}

/** Lists all members of a team with their user profiles. Returns empty if the requester isn't a member. */
export const list = authQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      _id: v.id("teamMembers"),
      _creationTime: v.number(),
      teamId: v.id("teams"),
      userId: v.id("users"),
      role: teamMemberRoleValidator,
      joinedAt: v.number(),
      user: v.union(
        v.object({
          _id: v.id("users"),
          email: v.optional(v.string()),
          fullName: v.optional(v.string()),
          firstName: v.optional(v.string()),
          lastName: v.optional(v.string()),
          // Presence, for the team page's Activity tab. Deliberately raw: only
          // a client can re-evaluate "seen in the last two minutes" over time.
          lastSeenAt: v.optional(v.number()),
          lastSeenPath: v.optional(v.string()),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const currentUserMembership = await getTeamMembership(
      ctx.db,
      args.teamId,
      ctx.userId,
    );

    if (!currentUserMembership) return [];

    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const membersWithUsers = [];
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      if (!user) {
        membersWithUsers.push({ ...member, user: null });
        continue;
      }
      const seen = mergeLastSeen(
        await getUserPresenceRow(ctx.db, member.userId),
        user,
      );
      membersWithUsers.push({
        ...member,
        user: {
          _id: user._id,
          email: user.email,
          fullName: user.fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          lastSeenAt: seen.lastSeenAt,
          lastSeenPath: seen.lastSeenPath,
        },
      });
    }

    return membersWithUsers;
  },
});

/**
 * Lists the user profiles that can be `@`-mentioned in a repo: the members of
 * the repo's team. Takes a repoId rather than a teamId because mention pickers
 * live on repo-scoped surfaces (chats, comments) that know the repo but not
 * necessarily the team. Returns empty when the caller lacks repo access or the
 * repo has no team (personal repo — nobody else to mention).
 */
export const listForRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      fullName: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const repo = await ctx.db.get(args.repoId);
    const teamId = repo?.teamId;
    if (!teamId) return [];

    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const users = [];
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      if (!user) continue;
      users.push({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
      });
    }
    return users;
  },
});

/** Adds a user to a team by email. Only team owners can add members. */
export const add = authMutation({
  args: {
    teamId: v.id("teams"),
    userEmail: v.string(),
  },
  returns: v.id("teamMembers"),
  handler: async (ctx, args) => {
    await requireTeamOwner(
      ctx.db,
      args.teamId,
      ctx.userId,
      "Only team owners can add members",
    );

    const targetUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .first();

    if (!targetUser) {
      throw new Error("User not found");
    }

    const existingMembership = await getTeamMembership(
      ctx.db,
      args.teamId,
      targetUser._id,
    );

    if (existingMembership) {
      throw new Error("User is already a member of this team");
    }

    const memberId = await ctx.db.insert("teamMembers", {
      teamId: args.teamId,
      userId: targetUser._id,
      role: "member",
      joinedAt: Date.now(),
    });

    return memberId;
  },
});

/** Removes a member from a team. Prevents removing the last owner. Only owners can remove. */
export const remove = authMutation({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTeamOwner(
      ctx.db,
      args.teamId,
      ctx.userId,
      "Only team owners can remove members",
    );

    const targetMembership = await getTeamMembership(
      ctx.db,
      args.teamId,
      args.userId,
    );

    if (!targetMembership) {
      throw new Error("User is not a member of this team");
    }

    if (args.userId === ctx.userId) {
      const allOwners = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_and_role", (q) =>
          q.eq("teamId", args.teamId).eq("role", "owner"),
        )
        .collect();

      if (allOwners.length === 1) {
        throw new Error("Cannot remove the last owner from the team");
      }
    }

    await ctx.db.delete(targetMembership._id);
    return null;
  },
});

/** Changes a team member's role (owner/member). Only owners can change roles. */
export const updateRole = authMutation({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
    role: teamMemberRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTeamOwner(
      ctx.db,
      args.teamId,
      ctx.userId,
      "Only team owners can change member roles",
    );

    const targetMembership = await getTeamMembership(
      ctx.db,
      args.teamId,
      args.userId,
    );

    if (!targetMembership) {
      throw new Error("User is not a member of this team");
    }

    if (
      targetMembership.role === "owner" &&
      args.role !== "owner"
    ) {
      const allOwners = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_and_role", (q) =>
          q.eq("teamId", args.teamId).eq("role", "owner"),
        )
        .collect();
      if (allOwners.length === 1) {
        throw new Error("Cannot remove the last owner from the team");
      }
    }

    await ctx.db.patch(targetMembership._id, { role: args.role });
    return null;
  },
});
