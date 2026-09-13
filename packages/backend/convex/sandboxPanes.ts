import { v } from "convex/values";
import { authMutation, authQuery } from "./functions";
import type { GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { terminalPaneValidator } from "./validators";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import {
  resolveSandboxOwnerForUser,
  sandboxOwnerValidator,
  type ResolvedSandboxOwner,
  type SandboxOwner,
} from "./_sandbox/owner";
import {
  assertStickyPreviewPort,
  normalizeStickyPreviewPath,
  truncateTerminalHistoryTail,
} from "./_sandbox/stickyPreview";

type TerminalPane = NonNullable<Doc<"sessions">["terminalPanes"]>[number];

const viewStateValidator = v.object({
  previewPath: v.optional(v.string()),
  terminalHistoryTail: v.optional(v.string()),
  agentBrowsingAt: v.optional(v.number()),
});

async function resolveOwnerOrThrow(
  db: GenericDatabaseWriter<DataModel>,
  userId: Id<"users">,
  owner: SandboxOwner,
): Promise<ResolvedSandboxOwner> {
  const resolved = await resolveSandboxOwnerForUser(db, userId, owner);
  if (!resolved) throw new Error("Sandbox owner not found");
  return resolved;
}

function defaultPane(ownerKey: string, createdAt: number): TerminalPane {
  return {
    id: `${ownerKey}-terminal-default`,
    title: "Console",
    createdAt,
  };
}

function nextPane(
  ownerKey: string,
  count: number,
  createdAt: number,
): TerminalPane {
  // `count` includes the default console pane at index 0, so the first
  // user-created terminal is "Terminal 1".
  return {
    id: `${ownerKey}-terminal-${createdAt}`,
    title: `Terminal ${count}`,
    createdAt,
  };
}

/** Existing panes, or a fresh list seeded with the stable default pane. */
function panesOrDefault(
  owner: ResolvedSandboxOwner,
  createdAt: number,
): TerminalPane[] {
  return owner.doc.terminalPanes && owner.doc.terminalPanes.length > 0
    ? owner.doc.terminalPanes
    : [defaultPane(owner.ownerKey, createdAt)];
}

async function patchPanes(
  db: GenericDatabaseWriter<DataModel>,
  owner: ResolvedSandboxOwner,
  panes: TerminalPane[],
) {
  if (owner.kind === "session") {
    await db.patch(owner.doc._id, { terminalPanes: panes });
  } else if (owner.kind === "task") {
    await db.patch(owner.doc._id, { terminalPanes: panes });
  } else {
    await db.patch(owner.doc._id, { terminalPanes: panes });
  }
}

/** Ensures every active sandbox has a stable shared default terminal pane. */
export const ensureDefaultTerminalPane = authMutation({
  args: { owner: sandboxOwnerValidator },
  returns: v.array(terminalPaneValidator),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const owner = await resolveSandboxOwnerForUser(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    if (!owner) return [];
    const panes = owner.doc.terminalPanes ?? [];
    if (panes.length > 0) return panes;
    const next = [defaultPane(owner.ownerKey, Date.now())];
    await patchPanes(ctx.db, owner, next);
    return next;
  },
});

/** Adds one shared terminal pane. All users viewing the sandbox see it. */
export const createTerminalPane = authMutation({
  args: { owner: sandboxOwnerValidator },
  returns: terminalPaneValidator,
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const owner = await resolveSandboxOwnerForUser(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    if (!owner) throw new Error("Sandbox owner not found");
    const createdAt = Date.now();
    const panes = panesOrDefault(owner, createdAt);
    const pane = nextPane(owner.ownerKey, panes.length, createdAt);
    await patchPanes(ctx.db, owner, [...panes, pane]);
    return pane;
  },
});

/** Removes one shared terminal pane, keeping the stable dev-server terminal. */
export const closeTerminalPane = authMutation({
  args: {
    owner: sandboxOwnerValidator,
    paneId: v.string(),
  },
  returns: v.array(terminalPaneValidator),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const owner = await resolveSandboxOwnerForUser(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    if (!owner) return [];
    const panes = panesOrDefault(owner, Date.now());
    if (panes[0]?.id === args.paneId) return panes;
    const next = panes.filter((pane) => pane.id !== args.paneId);
    await patchPanes(ctx.db, owner, next);
    return next;
  },
});

/** Shared sticky view state for every sandbox owner. */
export const getViewState = authQuery({
  args: { owner: sandboxOwnerValidator },
  returns: v.union(v.null(), viewStateValidator),
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwnerForUser(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    if (!owner) return null;
    return {
      previewPath: owner.doc.previewPath,
      terminalHistoryTail: owner.doc.terminalHistoryTail,
      agentBrowsingAt: owner.doc.agentBrowsingAt,
    };
  },
});

export const setPreviewPath = authMutation({
  args: { owner: sandboxOwnerValidator, path: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const owner = await resolveOwnerOrThrow(ctx.db, ctx.userId, args.owner);
    const previewPath = normalizeStickyPreviewPath(args.path);
    if (owner.kind === "session") {
      await ctx.db.patch(owner.doc._id, { previewPath });
    } else if (owner.kind === "task") {
      await ctx.db.patch(owner.doc._id, { previewPath });
    } else {
      await ctx.db.patch(owner.doc._id, { previewPath });
    }
    return null;
  },
});

export const setPreviewPort = authMutation({
  args: { owner: sandboxOwnerValidator, port: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const owner = await resolveOwnerOrThrow(ctx.db, ctx.userId, args.owner);
    assertStickyPreviewPort(args.port);
    if (owner.kind === "session") {
      await ctx.db.patch(owner.doc._id, { devPort: args.port });
    } else if (owner.kind === "task") {
      await ctx.db.patch(owner.doc._id, { devPort: args.port });
    } else {
      await ctx.db.patch(owner.doc._id, { devPort: args.port });
    }
    return null;
  },
});

export const setTerminalHistoryTail = authMutation({
  args: { owner: sandboxOwnerValidator, tail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const owner = await resolveOwnerOrThrow(ctx.db, ctx.userId, args.owner);
    const terminalHistoryTail = truncateTerminalHistoryTail(args.tail);
    if (owner.kind === "session") {
      await ctx.db.patch(owner.doc._id, { terminalHistoryTail });
    } else if (owner.kind === "task") {
      await ctx.db.patch(owner.doc._id, { terminalHistoryTail });
    } else {
      await ctx.db.patch(owner.doc._id, { terminalHistoryTail });
    }
    return null;
  },
});

export const releaseBrowserLock = authMutation({
  args: { owner: sandboxOwnerValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const owner = await resolveOwnerOrThrow(ctx.db, ctx.userId, args.owner);
    const patch = { agentBrowsingAt: undefined, updatedAt: Date.now() };
    if (owner.kind === "session") {
      await ctx.db.patch(owner.doc._id, patch);
    } else if (owner.kind === "task") {
      await ctx.db.patch(owner.doc._id, patch);
    } else {
      await ctx.db.patch(owner.doc._id, patch);
    }
    return null;
  },
});
