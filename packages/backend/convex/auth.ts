import { mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  themeValidator,
  roleUserValidator,
  customThemeValidator,
  userFields,
  experimentalFlagKeyValidator,
  resolvedExperimentalFlagsValidator,
  isShortcutId,
  shortcutOverridesValidator,
} from "./validators";
import { authQuery, authMutation } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import { getCurrentUserId } from "./_auth/currentUser";
import { resolveExperimentalFlags } from "./_auth/experimentalFlags";
import type { ExperimentalFlagKey } from "./_auth/experimentalFlags";

/** Returns the Clerk ID for a given user, or null if the user doesn't exist. */
export const getUserClerkId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.clerkId ?? null;
  },
});

/** Looks up a full user document by their Clerk ID. */
export const getUserByClerkId = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      ...userFields,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return user ?? null;
  },
});

/** Thin wrapper around getCurrentUserId for use as a function reference in actions. */
export const getUserIdFromIdentity = internalQuery({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    return await getCurrentUserId(ctx);
  },
});

/** Returns the authenticated user's ID. */
export const me = authQuery({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    return ctx.userId;
  },
});

/**
 * Resolves the current Clerk identity to a user record, creating one only as a
 * last resort. Lookup order: Clerk ID, then email (rebinding that record's
 * Clerk ID), then insert.
 */
export const ensureUserExists = mutation({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    wasCreated: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkUserId = identity.subject;
    const email = identity.email || "";

    if (!clerkUserId) {
      throw new Error("Clerk user ID is required");
    }

    const firstName =
      typeof identity.firstName === "string" ? identity.firstName : undefined;
    const lastName =
      typeof identity.lastName === "string" ? identity.lastName : undefined;
    const fullName =
      typeof identity.name === "string" ? identity.name : undefined;

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
      .first();

    if (existingUser) {
      const needsUpdate =
        existingUser.email !== (email || undefined) ||
        existingUser.firstName !== firstName ||
        existingUser.lastName !== lastName ||
        existingUser.fullName !== fullName;

      if (needsUpdate) {
        await ctx.db.patch(existingUser._id, {
          email: email || undefined,
          firstName,
          lastName,
          fullName,
        });
      }

      return {
        userId: existingUser._id,
        wasCreated: false,
      };
    }

    // No record for this Clerk ID. Before creating one, check whether this
    // person already exists under a stale Clerk ID from a different Clerk
    // instance — copying a prod snapshot into dev carries prod's Clerk IDs,
    // which never match the dev instance's IDs for the same human. Rebinding
    // the existing record beats stranding its data behind an orphaned ID.
    //
    // Email is the only identifier shared across instances. Clerk keeps
    // addresses unique per instance, so within one instance this can only fire
    // after an account is deleted and recreated, where reclaiming the record is
    // also what you want.
    if (email && identity.emailVerified === true) {
      const userWithSameEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();

      if (userWithSameEmail) {
        console.warn(
          `Rebinding user ${userWithSameEmail._id} from Clerk ID ${userWithSameEmail.clerkId ?? "(none)"} to ${clerkUserId} via email match`,
        );

        await ctx.db.patch(userWithSameEmail._id, {
          clerkId: clerkUserId,
          firstName,
          lastName,
          fullName,
        });

        return {
          userId: userWithSameEmail._id,
          wasCreated: false,
        };
      }
    }

    const userId = await ctx.db.insert("users", {
      clerkId: clerkUserId,
      email: email || undefined,
      firstName,
      lastName,
      fullName,
    });

    return {
      userId,
      wasCreated: true,
    };
  },
});

/** Returns the current user's selected theme preference. */
export const getTheme = authQuery({
  args: {},
  returns: v.union(themeValidator, v.null()),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return user?.theme ?? null;
  },
});

/** Updates the current user's theme preference. */
export const setTheme = authMutation({
  args: { theme: themeValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, { theme: args.theme });
    return null;
  },
});

/**
 * Returns whether the current user has opted in to email notifications
 * (daily summary + weekly changelog). Defaults to false (opt-in).
 */
export const getEmailNotificationsEnabled = authQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return user?.emailNotificationsEnabled ?? false;
  },
});

/** Updates the current user's email notification opt-in preference. */
export const setEmailNotificationsEnabled = authMutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, { emailNotificationsEnabled: args.enabled });
    return null;
  },
});

/**
 * All experimental opt-in flags for the current user. Missing / unset keys are
 * false.
 */
export const getExperimentalFlags = authQuery({
  args: {},
  returns: resolvedExperimentalFlagsValidator,
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return resolveExperimentalFlags(user);
  },
});

/** Updates one experimental flag on the current user. */
export const setExperimentalFlag = authMutation({
  args: {
    key: experimentalFlagKeyValidator,
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const user = await ctx.db.get(ctx.userId);
    if (!user) {
      throw new Error("User not found");
    }
    const key: ExperimentalFlagKey = args.key;
    await ctx.db.patch(ctx.userId, {
      experimentalFlags: {
        ...user.experimentalFlags,
        [key]: args.enabled,
      },
    });
    return null;
  },
});

/**
 * The current user's rebound keyboard shortcuts (settings → Shortcuts). Sparse:
 * an absent id means the client default is in force.
 */
export const getShortcutOverrides = authQuery({
  args: {},
  returns: shortcutOverridesValidator,
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return user?.shortcutOverrides ?? {};
  },
});

/**
 * Rebinds one shortcut for the current user. Passing `null` drops the override
 * so the shortcut falls back to its default combo.
 */
export const setShortcutOverride = authMutation({
  args: {
    id: v.string(),
    hotkey: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    // The id vocabulary is derived from SHORTCUT_DEFS rather than repeated as a
    // validator union, so the check happens here instead of in `args`.
    if (!isShortcutId(args.id)) {
      throw new Error(`Unknown shortcut id: ${args.id}`);
    }
    const user = await ctx.db.get(ctx.userId);
    if (!user) {
      throw new Error("User not found");
    }
    const next = { ...user.shortcutOverrides };
    if (args.hotkey === null) {
      delete next[args.id];
    } else {
      next[args.id] = args.hotkey;
    }
    await ctx.db.patch(ctx.userId, { shortcutOverrides: next });
    return null;
  },
});

/** Clears every shortcut override, restoring all defaults. */
export const resetShortcutOverrides = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, { shortcutOverrides: {} });
    return null;
  },
});

/** Returns the current user's custom theme configuration. */
export const getCustomTheme = authQuery({
  args: {},
  returns: v.union(customThemeValidator, v.null()),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return user?.customTheme ?? null;
  },
});

/** Updates the current user's custom theme configuration. */
export const setCustomTheme = authMutation({
  args: { customTheme: customThemeValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, { customTheme: args.customTheme });
    return null;
  },
});

/** Returns the current user's personalisation settings (role + custom instructions). */
export const getPersonalisation = authQuery({
  args: {},
  returns: v.object({
    role: v.union(roleUserValidator, v.null()),
    customInstructions: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return {
      role: user?.role ?? null,
      customInstructions: user?.customInstructions ?? null,
    };
  },
});

/** Updates the current user's custom instructions. */
export const setCustomInstructions = authMutation({
  args: { customInstructions: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, {
      customInstructions: args.customInstructions || undefined,
    });
    return null;
  },
});

/** Updates the current user's functional role preset. */
export const setRole = authMutation({
  args: { role: v.union(roleUserValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, {
      role: args.role ?? undefined,
    });
    return null;
  },
});

/** Whether the welcome setup dialog should appear for the current user. */
export const getOnboardingStatus = authQuery({
  args: {},
  returns: v.object({ show: v.boolean() }),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    if (!user) return { show: false };
    if (user.onboardingCompletedAt) return { show: false };

    return { show: true };
  },
});

/** Marks the welcome setup flow as completed (continue or skip). */
export const completeOnboarding = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, { onboardingCompletedAt: Date.now() });
    return null;
  },
});

/** Returns whether the toolbar is visible for the current user. */
export const getToolbarVisible = authQuery({
  args: {},
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return user?.toolbarVisible ?? null;
  },
});

/** Toggles the toolbar visibility preference for the current user. */
export const setToolbarVisible = authMutation({
  args: { visible: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await ctx.db.patch(ctx.userId, { toolbarVisible: args.visible });
    return null;
  },
});
