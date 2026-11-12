"use node";

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getSandboxHandle } from "./helpers";
import { launchPreviewDevServer } from "./sessions";
import { sandboxOwnerKey } from "@eva/shared";

/**
 * Relaunches the session's managed dev server on `sandboxId`: bails on a
 * closing/starting status, a missing or mismatched devPort, or a non-running
 * sandbox; otherwise relaunches it through the single Console launcher.
 */
async function recoverSessionPreview(
  ctx: ActionCtx,
  args: { sandboxId: string; repoId: Id<"githubRepos">; expectedPort: number },
  session: Doc<"sessions">,
): Promise<null> {
  // "starting" owns service launches: the startup flow resolves the real
  // port and launches the dev server itself, and this recovery racing it
  // with a stale sticky devPort is exactly how a duplicate server appeared
  // on the wrong port (observed in prod: startup launched 13000, a recovery
  // scheduled during startup launched 3001 one second later).
  const status = session.status;
  if (status === "closed" || status === "stopping" || status === "starting")
    return null;

  const { devPort, devCommand } = session;
  if (devPort === undefined || devCommand === undefined) return null;
  // Multi-app repos preview secondary apps on their own ports; this recovery
  // only owns the primary dev server.
  if (devPort !== args.expectedPort) return null;

  const [handle, repo] = await Promise.all([
    getSandboxHandle(ctx, args.repoId, args.sandboxId),
    ctx.runQuery(internal.githubRepos.getInternal, { id: args.repoId }),
  ]);
  // Never exec on a non-running sandbox — on Vercel any exec lazily resumes
  // a stopped VM (see prewarmNeverResurrects contract). handle.state is
  // fresh: getSandboxHandle fetches with resume:false.
  if (handle.state !== "running") return null;

  console.log(
    `[sandbox] preview recovery: relaunching dev server sandbox=${args.sandboxId} port=${devPort}`,
  );
  await launchPreviewDevServer(
    handle,
    sandboxOwnerKey({ kind: "session", sessionId: session._id }),
    devCommand,
    devPort,
    repo?.rootDirectory ?? "",
  );
  return null;
}

/**
 * Relaunches the managed dev server when the preview readiness poll finds the
 * sandbox running but nothing serving the app port.
 *
 * Nothing watches the dev server after launch: an OOM kill, or a lazily
 * resumed VM (any exec on a stopped Vercel sandbox restores the filesystem but
 * none of the services), leaves the app port dead while the owner stays
 * active — the preview shows not-ready forever, Console shows no dev server,
 * and the navigation proxy is never ensured because that only happens on a
 * passing probe. This action closes the loop through the single Console
 * launcher (`launchPreviewDevServer` → tmux), so the relaunched server is
 * visible in Console and the proxy self-heals on the next ready poll.
 *
 * Idempotence lives in the launcher: it skips when something already listens
 * on the port, so races with a slow-compiling but live server are harmless.
 *
 * The readiness poll that schedules this action only knows sandboxId/port, so
 * the owning session is resolved here by sandbox id.
 */
export const ensureSessionPreviewServices = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    /** The upstream listen port the failing preview probed. */
    expectedPort: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const session: Doc<"sessions"> | null = await ctx.runQuery(
      internal.sessions.getBySandboxInternal,
      { sandboxId: args.sandboxId },
    );
    if (session) return recoverSessionPreview(ctx, args, session);
    return null;
  },
});
