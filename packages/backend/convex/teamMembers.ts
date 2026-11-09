import type { GenericDatabaseReader } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc } from "./_generated/dataModel";
import {
  authQuery,
  authMutation,
  getTeamMembership,
  hasRepoAccess,
  requireTeamOwner,
} from "./functions";
import { getUserPresenceRow, mergeLastSeen } from "./_users/lastSeen";
import { teamMemberRoleValidator } from "./validators";

/** Throws when this membership is its team's only owner, so a team never loses its last owner. */
async function assertNotLastOwner(
  db: GenericDatabaseReader<DataModel>,
  membership: Doc<"teamMembers">,
  action: "remove" | "demote",
): Promise<void> {
  if (membership.role !== "owner") return;
  const owners = await db
    .query("teamMembers")
    .withIndex("by_team_and_role", (q) =>
      q.eq("teamId", membership.teamId).eq("role", "owner"),
    )
    .take(2);
  if (owners.length < 2) {
    throw new Error(`Cannot ${action} the last owner from the team`);
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

    return await Promise.all(
      members.map(async (member) => {
        const [user, presence] = await Promise.all([
          ctx.db.get(member.userId),
          getUserPresenceRow(ctx.db, member.userId),
        ]);
        if (!user) return { ...member, user: null };
        const seen = mergeLastSeen(presence, user);
        return {
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
        };
      }),
    );
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

    // The repo's connector can be outside its team: names only for them.
    const callerOnTeam = members.some((m) => m.userId === ctx.userId);
    const users = await Promise.all(
      members.map((member) => ctx.db.get(member.userId)),
    );
    return users.flatMap((user) =>
      user
        ? [
            {
              _id: user._id,
              fullName: user.fullName,
              email: callerOnTeam ? user.email : undefined,
            },
          ]
        : [],
    );
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

    await assertNotLastOwner(ctx.db, targetMembership, "remove");

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

    if (args.role !== "owner") {
      await assertNotLastOwner(ctx.db, targetMembership, "demote");
    }

    await ctx.db.patch(targetMembership._id, { role: args.role });
    return null;
  },
});
