import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { roleUserValidator } from "./validators";
import { authQuery } from "./functions";
import { getUserPresenceRow, mergeLastSeen } from "./_users/lastSeen";
import { collectDirectoryUserIds } from "./_users/directory";
import { isDirectoryPeer } from "./_auth/entityAccess";

/** Returns the Clerk ID for a user (internal use only). */
export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ clerkId: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.clerkId) return null;
    return { clerkId: user.clerkId };
  },
});

/** First/full name for derived personal-account labels (node actions). */
export const getDisplayNameInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      firstName: v.optional(v.string()),
      fullName: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return { firstName: user.firstName, fullName: user.fullName };
  },
});

/** Fetches a user's public profile (name, last seen) by their ID. */
export const get = authQuery({
  args: { id: v.id("users") },
  returns: v.union(
    v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      fullName: v.optional(v.string()),
      email: v.optional(v.string()),
      role: v.optional(roleUserValidator),
      lastSeenAt: v.optional(v.number()),
      lastSeenPath: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!(await isDirectoryPeer(ctx.db, ctx.userId, args.id))) return null;
    const user = await ctx.db.get(args.id);
    if (!user) return null;
    const seen = mergeLastSeen(
      await getUserPresenceRow(ctx.db, args.id),
      user,
    );
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: args.id === ctx.userId ? user.email : undefined,
      role: user.role,
      lastSeenAt: seen.lastSeenAt,
      lastSeenPath: seen.lastSeenPath,
    };
  },
});

/**
 * Lists every user with an email address, for sending broadcast emails such as
 * the weekly changelog. Internal use only.
 */
export const listEmailRecipients = internalQuery({
  args: {},
  returns: v.array(
    v.object({ email: v.string(), name: v.optional(v.string()) }),
  ),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const recipients = [];
    for (const user of users) {
      if (!user.email) continue;
      if (user.emailNotificationsEnabled !== true) continue;
      recipients.push({
        email: user.email,
        name: user.firstName ?? user.fullName,
      });
    }
    return recipients;
  },
});

/**
 * Lists the current user's team name and all teammates, sorted by name.
 *
 * Who counts as "online" is decided by the caller from `lastSeenAt`, not here:
 * a query cannot read the clock (Convex invalidates on data, so the cached
 * result would keep whatever the clock said first), and the sidebar already
 * re-evaluates presence on its own tick.
 */
export const listTeamWithMembers = authQuery({
  args: {},
  returns: v.union(
    v.object({
      teamName: v.string(),
      logoUrl: v.optional(v.union(v.string(), v.null())),
      members: v.array(
        v.object({
          _id: v.id("users"),
          firstName: v.optional(v.string()),
          lastName: v.optional(v.string()),
          fullName: v.optional(v.string()),
          lastSeenAt: v.optional(v.number()),
          lastSeenPath: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    if (memberships.length === 0) return null;

    const teamMembership = memberships[0];
    const team = await ctx.db.get(teamMembership.teamId);
    if (!team) return null;

    let displayName = team.name;
    if (team.isPersonal) {
      if (team.createdBy === ctx.userId) {
        displayName = "My Team";
      } else {
        const owner = await ctx.db.get(team.createdBy);
        const ownerName = owner?.firstName ?? owner?.fullName ?? "Unknown";
        displayName = `${ownerName}'s Team`;
      }
    }

    const teamMembers = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamMembership.teamId))
      .collect();

    const members = [];
    for (const tm of teamMembers) {
      if (tm.userId === ctx.userId) continue;
      const user = await ctx.db.get(tm.userId);
      if (user) {
        const seen = mergeLastSeen(
          await getUserPresenceRow(ctx.db, tm.userId),
          user,
        );
        members.push({
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          lastSeenAt: seen.lastSeenAt,
          lastSeenPath: seen.lastSeenPath,
        });
      }
    }

    // By name: the previous online-first order changed with the clock, which is
    // what made this query non-cacheable, and it reshuffled avatars under the
    // pointer as people went idle.
    members.sort((a, b) =>
      (a.firstName ?? a.fullName ?? "").localeCompare(
        b.firstName ?? b.fullName ?? "",
      ),
    );

    const logoUrl = team.logoStorageId
      ? await ctx.storage.getUrl(team.logoStorageId)
      : null;

    return { teamName: displayName, logoUrl, members };
  },
});

const publicProfileValidator = v.object({
  _id: v.id("users"),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  fullName: v.optional(v.string()),
  role: v.optional(roleUserValidator),
});

/** Teammates (and the caller) — not every user in the deployment. */
export const listAll = authQuery({
  args: {},
  returns: v.array(publicProfileValidator),
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    const memberRows = [];
    for (const membership of memberships) {
      const rows = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", membership.teamId))
        .collect();
      memberRows.push(...rows);
    }
    const ids = collectDirectoryUserIds(ctx.userId, memberRows);
    const profiles = [];
    for (const id of ids) {
      const user = await ctx.db.get(id);
      if (!user) continue;
      profiles.push({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
      });
    }
    return profiles;
  },
});

/**
 * Public profiles for specific users. Chat uses this instead of `listAll` so a
 * lastSeenAt write on one user does not re-run every transcript's directory
 * subscription.
 */
export const getMany = authQuery({
  args: { ids: v.array(v.id("users")) },
  returns: v.array(publicProfileValidator),
  handler: async (ctx, args) => {
    const uniqueIds = [...new Set(args.ids)];
    const profiles = [];
    for (const id of uniqueIds) {
      if (!(await isDirectoryPeer(ctx.db, ctx.userId, id))) continue;
      const user = await ctx.db.get(id);
      if (!user) continue;
      profiles.push({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
      });
    }
    return profiles;
  },
});
