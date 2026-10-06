"use node";

import { v } from "convex/values";
import { Effect } from "effect";
import { action } from "./_generated/server";
import { resolveSandboxCredentials } from "./envVarResolver";
import { getSandboxHandle } from "./_sandbox_runtime/helpers";
import { unwrapVercelSandbox } from "./_sandbox/vercelProvider";
import { ownerArg, resolveOwner } from "./_pty/owners";
import { requireRunningSandbox } from "./_pty/ptyErrors";
import { sandboxOwnerKey } from "./_sandbox/owner";
import { runActionEffect } from "./_effect/action";
import { getActionRepoWithAccess } from "./functions";
import {
  connectVercelInteractive,
  ensureVercelSharedTerminal,
} from "./_pty/vercel";

/** Connects to or creates a PTY for a session or task, returning the WebSocket URL. */
export const connectPty = action({
  args: {
    owner: ownerArg,
    cols: v.number(),
    rows: v.number(),
    ptyInstanceId: v.optional(v.string()),
  },
  returns: v.object({
    wsUrl: v.string(),
    ptySessionId: v.string(),
    isNewPty: v.boolean(),
    ptyProtocol: v.literal("vercel"),
    ptyAuthToken: v.optional(v.string()),
    sharedPtySessionName: v.optional(v.string()),
    initialOutput: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    wsUrl: string;
    ptySessionId: string;
    isNewPty: boolean;
    ptyProtocol: "vercel";
    ptyAuthToken?: string;
    sharedPtySessionName?: string;
    initialOutput?: string;
  }> =>
    runActionEffect(
      // Auth, owner resolution and access stay defects: a failure there is an
      // outage or a bug, not an answer the user can act on.
      Effect.promise(async () => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const resolved = await resolveOwner(ctx, args.owner);
        await getActionRepoWithAccess(ctx, resolved.repoId);
        return resolved;
      }).pipe(
        // Never open a terminal against a stopping/closed sandbox: the setup
        // exec (ensureVercelSharedTerminal) would lazily resume a stopped
        // Vercel VM, resurrecting a sandbox the user stopped and defeating a
        // manual stop. A reconnecting terminal tab is what kept an idle sandbox
        // running with no active session.
        Effect.flatMap(requireRunningSandbox),
        Effect.flatMap((resolved) =>
          Effect.promise(async () => {
            await resolveSandboxCredentials(ctx, resolved.repoId);

            const handle = await getSandboxHandle(
              ctx,
              resolved.repoId,
              resolved.sandboxId,
            );
            const shared = await ensureVercelSharedTerminal(
              handle,
              args.ptyInstanceId,
            );
            const vercelSandbox = unwrapVercelSandbox(handle);
            const { wsUrl, ptySessionId, authToken } =
              await connectVercelInteractive(vercelSandbox, shared.sessionName);
            return {
              wsUrl,
              ptySessionId,
              isNewPty: shared.isNewPty,
              ptyProtocol: "vercel" as const,
              initialOutput: shared.initialOutput,
              ptyAuthToken: authToken,
              sharedPtySessionName: shared.sessionName,
            };
          }),
        ),
      ),
      `pty.connectPty owner=${sandboxOwnerKey(args.owner)}`,
    ),
});

/**
 * Resizes an existing PTY session to the given column and row dimensions.
 * Vercel interactive PTY is controller-hosted — resize is handled client-side,
 * so this is a no-op kept for API compatibility with existing callers.
 */
export const resizePty = action({
  args: {
    owner: ownerArg,
    cols: v.number(),
    rows: v.number(),
    ptyInstanceId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const resolved = await resolveOwner(ctx, args.owner);
    await getActionRepoWithAccess(ctx, resolved.repoId);
    return null;
  },
});

/**
 * Kills the PTY session for a sandbox.
 * Vercel interactive PTY ends when the WebSocket closes — nothing to kill,
 * so this is a no-op kept for API compatibility with existing callers.
 */
export const disconnectPty = action({
  args: {
    owner: ownerArg,
    ptyInstanceId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const resolved = await resolveOwner(ctx, args.owner);
    await getActionRepoWithAccess(ctx, resolved.repoId);
    return null;
  },
});
