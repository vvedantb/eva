import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import {
  authQuery,
  authMutation,
  hasRepoAccess,
  hasTaskAccess,
} from "./functions";
import { aiProviderValidator } from "./validators";
import {
  listAccountsFor,
  listSelectableAccountsFor,
} from "./_userProviderAccounts/listing";
import { isAccountUsableBy } from "./_userProviderAccounts/sharing";

const credentialValidator = v.object({ key: v.string(), value: v.string() });

const accountListItemValidator = v.object({
  _id: v.id("userProviderAccounts"),
  _creationTime: v.number(),
  provider: aiProviderValidator,
  label: v.string(),
  credentials: v.array(credentialValidator),
  shared: v.boolean(),
  // Owned by the pool owner this list was built for (the viewer, or the task /
  // session owner), as opposed to a teammate's shared account. Sharing is not
  // enough to tell them apart: an own account can be shared too.
  isOwn: v.boolean(),
  lastUsedAt: v.optional(v.number()),
  // First name of whoever last ran on it, omitted when that was the owner.
  lastUsedByName: v.optional(v.string()),
  updatedAt: v.number(),
});

/**
 * Lists the authenticated user's own provider accounts, masking credential
 * values. Powers the Accounts settings page, so it stays owner-only: every row
 * here is editable and deletable. `label` is always the user's first name
 * (derived), not a free-text field.
 */
export const list = authQuery({
  args: {},
  returns: v.array(accountListItemValidator),
  handler: async (ctx) => await listAccountsFor(ctx, ctx.userId, true),
});

/**
 * Lists the accounts the viewer can run on — their own plus teammates' shared
 * ones — for pickers with no session or task context yet.
 */
export const listSelectable = authQuery({
  args: {},
  returns: v.array(accountListItemValidator),
  handler: async (ctx) => await listSelectableAccountsFor(ctx, ctx.userId),
});

/**
 * Lists the accounts the task owner can run on (masked) for the model picker.
 * Teammates with task access can see which accounts power the sticky
 * credential; only the owner can change the selection.
 */
export const listForTaskOwner = authQuery({
  args: { taskId: v.id("agentTasks") },
  returns: v.array(accountListItemValidator),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      return [];
    }
    return await listSelectableAccountsFor(ctx, task.createdBy);
  },
});

/**
 * Lists the accounts the session owner can run on (masked) for the model
 * picker. A session runs on its owner's credentials whoever sends the turn, so
 * collaborators see — and pick from — the owner's accounts, never their own.
 */
export const listForSessionOwner = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(accountListItemValidator),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      !(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))
    ) {
      return [];
    }
    return await listSelectableAccountsFor(
      ctx,
      session.createdBy ?? session.userId,
    );
  },
});

/**
 * Returns a single account with raw (encrypted) credentials for launch-time
 * injection. Includes `userId` so the caller can assert ownership before
 * decrypting. Internal only.
 */
export const getByIdInternal = internalQuery({
  args: { accountId: v.id("userProviderAccounts") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      provider: aiProviderValidator,
      credentials: v.array(credentialValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.accountId);
    if (!doc) return null;
    return {
      userId: doc.userId,
      provider: doc.provider,
      credentials: doc.credentials,
    };
  },
});

/**
 * Returns an account's raw (encrypted) credentials for launch-time injection,
 * but only when `ownerUserId` may run on it — they own it, or it is shared and
 * they are teammates. Returns null otherwise so the caller degrades to the team
 * credential. Internal only.
 */
export const getForLaunchInternal = internalQuery({
  args: {
    accountId: v.id("userProviderAccounts"),
    ownerUserId: v.id("users"),
  },
  returns: v.union(
    v.null(),
    v.object({
      provider: aiProviderValidator,
      credentials: v.array(credentialValidator),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.accountId);
    if (!doc) return null;
    if (!(await isAccountUsableBy(ctx.db, doc, args.ownerUserId))) return null;
    return {
      provider: doc.provider,
      credentials: doc.credentials,
      updatedAt: doc.updatedAt,
    };
  },
});

/**
 * Stamps an account as used at launch, so its owner can see a share still being
 * spent on. Called only after `getForLaunchInternal` has cleared the account, so
 * it does not re-check usability. Silently no-ops on a deleted account, and
 * leaves `updatedAt` alone: that drives picker order. Internal only.
 */
export const recordUsageInternal = internalMutation({
  args: {
    accountId: v.id("userProviderAccounts"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.accountId);
    if (!doc) return null;
    await ctx.db.patch(args.accountId, {
      lastUsedAt: Date.now(),
      lastUsedByUserId: args.userId,
    });
    return null;
  },
});

/** Inserts a new account with pre-encrypted credentials. Internal only. */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    provider: aiProviderValidator,
    label: v.string(),
    credentials: v.array(credentialValidator),
  },
  returns: v.id("userProviderAccounts"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("userProviderAccounts", {
      userId: args.userId,
      provider: args.provider,
      label: args.label,
      credentials: args.credentials,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Updates an existing account's pre-encrypted credentials. Asserts ownership.
 * Provider is immutable. Label is always overwritten from the owner's first
 * name. Internal only.
 */
export const updateInternal = internalMutation({
  args: {
    accountId: v.id("userProviderAccounts"),
    userId: v.id("users"),
    label: v.string(),
    credentials: v.array(credentialValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.accountId);
    if (!doc || doc.userId !== args.userId) {
      throw new Error("Account not found");
    }
    await ctx.db.patch(args.accountId, {
      label: args.label,
      credentials: args.credentials,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Shares or unshares one of the authenticated user's own accounts with their
 * teammates. Does not touch `updatedAt`: that drives picker order and the
 * most-recently-updated default, which sharing must not disturb.
 */
export const setShared = authMutation({
  args: {
    accountId: v.id("userProviderAccounts"),
    shared: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.accountId);
    if (!doc || doc.userId !== ctx.userId) {
      throw new Error("Account not found");
    }
    await ctx.db.patch(args.accountId, { shared: args.shared });
    return null;
  },
});

/** Deletes one of the authenticated user's own accounts. */
export const remove = authMutation({
  args: { accountId: v.id("userProviderAccounts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.accountId);
    if (!doc || doc.userId !== ctx.userId) {
      throw new Error("Account not found");
    }
    await ctx.db.delete(args.accountId);
    return null;
  },
});
