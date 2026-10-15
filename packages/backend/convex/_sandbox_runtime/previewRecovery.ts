"use node";

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { sandboxOwnerKey } from "../_sandbox/owner";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getSandboxHandle } from "./helpers";
import { launchPreviewDevServer } from "./sessions";

type SandboxStatus = "closed" | "stopping" | "starting" | string;

/**
 * The status/devPort/devCommand/ownerKey field access for one possible
 * sandbox owner (session, quick task, project chat) — the only thing that
 * differs between owners, since the guard shape and recovery steps
 * (`recoverPreviewOwner` below) are identical.
 */
type PreviewOwnerConfig<TEntity> = {
  status: (entity: TEntity) => SandboxStatus | undefined;
  devPort: (entity: TEntity) => number | undefined;
  devCommand: (entity: TEntity) => string | undefined;
  ownerKey: (entity: TEntity) => string;
};

const sessionOwnerConfig: PreviewOwnerConfig<Doc<"sessions">> = {
  status: (session) => session.status,
  devPort: (session) => session.devPort,
  devCommand: (session) => session.devCommand,
  ownerKey: (session) =>
    sandboxOwnerKey({ kind: "session", sessionId: session._id }),
};

const taskOwnerConfig: PreviewOwnerConfig<Doc<"agentTasks">> = {
  status: (task) => task.reviewTaskSandboxStatus,
  devPort: (task) => task.devPort,
  devCommand: (task) => task.devCommand,
  ownerKey: (task) => sandboxOwnerKey({ kind: "task", taskId: task._id }),
};

const projectOwnerConfig: PreviewOwnerConfig<Doc<"projects">> = {
  status: (project) => project.reviewProjectSandboxStatus,
  devPort: (project) => project.devPort,
  devCommand: (project) => project.devCommand,
  ownerKey: (project) =>
    sandboxOwnerKey({ kind: "project", projectId: project._id }),
};

/**
 * Runs the shared recovery guard chain for one already-resolved sandbox
 * owner: bail on a closing/starting status, a missing or mismatched devPort,
 * or a non-running sandbox; otherwise relaunch the dev server through the
 * single Console launcher. Called once per owner kind (never looped over a
 * heterogeneous list) so each call site stays monomorphic — TypeScript can't
 * safely narrow a union of differently-shaped owner entities inside a shared
 * loop body.
 */
async function recoverPreviewOwner<TEntity>(
  ctx: ActionCtx,
  args: { sandboxId: string; repoId: Id<"githubRepos">; expectedPort: number },
  entity: TEntity,
  config: PreviewOwnerConfig<TEntity>,
): Promise<null> {
  // "starting" owns service launches: the startup flow resolves the real
  // port and launches the dev server itself, and this recovery racing it
  // with a stale sticky devPort is exactly how a duplicate server appeared
  // on the wrong port (observed in prod: startup launched 13000, a recovery
  // scheduled during startup launched 3001 one second later).
  const status = config.status(entity);
  if (status === "closed" || status === "stopping" || status === "starting")
    return null;

  const devPort = config.devPort(entity);
  const devCommand = config.devCommand(entity);
  if (devPort === undefined || devCommand === undefined) return null;
  // Multi-app repos preview secondary apps on their own ports; this recovery
  // only owns the primary dev server.
  if (devPort !== args.expectedPort) return null;

  const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
  // Never exec on a non-running sandbox — on Vercel any exec lazily resumes
  // a stopped VM (see prewarmNeverResurrects contract). handle.state is
  // fresh: getSandboxHandle fetches with resume:false.
  if (handle.state !== "running") return null;

  const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
    id: args.repoId,
  });
  console.log(
    `[sandbox] preview recovery: relaunching dev server sandbox=${args.sandboxId} port=${devPort}`,
  );
  await launchPreviewDevServer(
    handle,
    config.ownerKey(entity),
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
 * A sandbox can be owned by a session, a quick task, or a project chat — the
 * readiness poll that schedules this action is entity-agnostic (it only knows
 * sandboxId/port), so the owner is resolved here by sandbox id, checked in
 * that order (sessions first, matching the pre-existing behavior).
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
    if (session) {
      return recoverPreviewOwner<Doc<"sessions">>(
        ctx,
        args,
        session,
        sessionOwnerConfig,
      );
    }

    const task: Doc<"agentTasks"> | null = await ctx.runQuery(
      internal.agentTasks.getBySandboxInternal,
      { sandboxId: args.sandboxId },
    );
    if (task) {
      return recoverPreviewOwner<Doc<"agentTasks">>(
        ctx,
        args,
        task,
        taskOwnerConfig,
      );
    }

    const project: Doc<"projects"> | null = await ctx.runQuery(
      internal.projects.getBySandboxInternal,
      { sandboxId: args.sandboxId },
    );
    if (project) {
      return recoverPreviewOwner<Doc<"projects">>(
        ctx,
        args,
        project,
        projectOwnerConfig,
      );
    }

    return null;
  },
});
