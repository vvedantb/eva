import { v } from "convex/values";
import { authMutation, authQuery } from "./functions";
import type { Doc } from "./_generated/dataModel";
import { terminalPaneValidator } from "./validators";
import {
  patchSandboxOwner,
  resolveSandboxOwnerForUser,
  resolveSandboxOwnerOrThrow,
  sandboxOwnerValidator,
  type ResolvedSandboxOwner,
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

/** Ensures every active sandbox has a stable shared default terminal pane. */
export const ensureDefaultTerminalPane = authMutation({
  args: { owner: sandboxOwnerValidator },
  returns: v.array(terminalPaneValidator),
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwnerForUser(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    if (!owner) return [];
    const panes = owner.doc.terminalPanes ?? [];
    if (panes.length > 0) return panes;
    const next = [defaultPane(owner.ownerKey, Date.now())];
    await patchSandboxOwner(ctx.db, owner, { terminalPanes: next });
    return next;
  },
});

/** Adds one shared terminal pane. All users viewing the sandbox see it. */
export const createTerminalPane = authMutation({
  args: { owner: sandboxOwnerValidator },
  returns: terminalPaneValidator,
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwnerOrThrow(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    const createdAt = Date.now();
    const panes = panesOrDefault(owner, createdAt);
    const pane = nextPane(owner.ownerKey, panes.length, createdAt);
    await patchSandboxOwner(ctx.db, owner, { terminalPanes: [...panes, pane] });
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
    const owner = await resolveSandboxOwnerForUser(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    if (!owner) return [];
    const panes = panesOrDefault(owner, Date.now());
    if (panes[0]?.id === args.paneId) return panes;
    const next = panes.filter((pane) => pane.id !== args.paneId);
    await patchSandboxOwner(ctx.db, owner, { terminalPanes: next });
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
    const owner = await resolveSandboxOwnerOrThrow(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    const previewPath = normalizeStickyPreviewPath(args.path);
    await patchSandboxOwner(ctx.db, owner, { previewPath });
    return null;
  },
});

export const setPreviewPort = authMutation({
  args: { owner: sandboxOwnerValidator, port: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwnerOrThrow(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    assertStickyPreviewPort(args.port);
    await patchSandboxOwner(ctx.db, owner, { devPort: args.port });
    return null;
  },
});

export const setTerminalHistoryTail = authMutation({
  args: { owner: sandboxOwnerValidator, tail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwnerOrThrow(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    const terminalHistoryTail = truncateTerminalHistoryTail(args.tail);
    await patchSandboxOwner(ctx.db, owner, { terminalHistoryTail });
    return null;
  },
});

export const releaseBrowserLock = authMutation({
  args: { owner: sandboxOwnerValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await resolveSandboxOwnerOrThrow(
      ctx.db,
      ctx.userId,
      args.owner,
    );
    await patchSandboxOwner(ctx.db, owner, {
      agentBrowsingAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
