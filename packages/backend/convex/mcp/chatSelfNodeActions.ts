"use node";

import { v, type Infer } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { SandboxHandle } from "../_sandbox/provider";
import { getSandboxHandle } from "../_sandbox_runtime/helpers";
import { launchPreviewDevServer } from "../_sandbox_runtime/sessions";
import { vercelAppListenPort } from "../_sandbox_runtime/vercelAppPorts";
import { previewConsoleSessionName } from "../_pty/consoleSessionName";
import {
  buildFreePortLines,
  buildPortListenProbeCommand,
} from "../_sandbox_runtime/httpReadyProbe";

const PORT_RELEASE_WAIT_SECONDS = 2;

const sandboxArgs = {
  repoId: v.id("githubRepos"),
  sandboxId: v.string(),
  ownerKey: v.string(),
  devPort: v.number(),
};

async function portListening(
  handle: SandboxHandle,
  port: number,
): Promise<boolean> {
  const result = await handle.exec(
    buildPortListenProbeCommand(port, "busy", "free"),
    { cwd: "/", timeoutSeconds: 10 },
  );
  return result.output.trim() === "busy";
}

async function runningHandle(
  ctx: ActionCtx,
  repoId: Id<"githubRepos">,
  sandboxId: string,
): Promise<{ handle: SandboxHandle } | { state: string }> {
  const handle = await getSandboxHandle(ctx, repoId, sandboxId);
  if (handle.state !== "running") return { state: handle.state };
  return { handle };
}

const tailResultValidator = v.union(
  v.object({ running: v.literal(false), vmState: v.string() }),
  v.object({
    running: v.literal(true),
    consoleSessionExists: v.boolean(),
    output: v.string(),
    listenPort: v.number(),
    portListening: v.boolean(),
  }),
);

/** Tails the Preview Console's tmux pane and probes the app port. */
export const tailDevServerLogs = internalAction({
  args: { ...sandboxArgs, lines: v.number() },
  returns: tailResultValidator,
  handler: async (ctx, args): Promise<Infer<typeof tailResultValidator>> => {
    const vm = await runningHandle(ctx, args.repoId, args.sandboxId);
    if ("state" in vm) return { running: false, vmState: vm.state };
    const { handle } = vm;

    const sessionName = previewConsoleSessionName(args.ownerKey);
    const lines = Math.max(1, Math.floor(args.lines));
    const capture = await handle.exec(
      `if tmux has-session -t ${sessionName} >/dev/null 2>&1; then echo __EVA_HAS_SESSION__; tmux capture-pane -p -J -S -${lines} -t ${sessionName}; else echo __EVA_NO_SESSION__; fi`,
      { cwd: "/", timeoutSeconds: 15 },
    );
    const [marker, ...rest] = capture.output.split("\n");
    const listenPort = vercelAppListenPort(args.devPort);
    return {
      running: true,
      consoleSessionExists: marker?.trim() === "__EVA_HAS_SESSION__",
      output: rest.join("\n").replace(/\s+$/, ""),
      listenPort,
      portListening: await portListening(handle, listenPort),
    };
  },
});

const restartResultValidator = v.union(
  v.object({ restarted: v.literal(false), vmState: v.string() }),
  v.object({ restarted: v.literal(true), listenPort: v.number() }),
);

/**
 * Stops whatever serves the app port and relaunches the dev server through
 * the single Console launcher, as preview recovery does but forced: the
 * launcher skips a busy port, so the port is freed first.
 */
export const restartDevServer = internalAction({
  args: {
    ...sandboxArgs,
    devCommand: v.string(),
    rootDirectory: v.string(),
  },
  returns: restartResultValidator,
  handler: async (ctx, args): Promise<Infer<typeof restartResultValidator>> => {
    const vm = await runningHandle(ctx, args.repoId, args.sandboxId);
    if ("state" in vm) return { restarted: false, vmState: vm.state };
    const { handle } = vm;

    const sessionName = previewConsoleSessionName(args.ownerKey);
    const listenPort = vercelAppListenPort(args.devPort);
    await handle.exec(
      [
        `tmux has-session -t ${sessionName} >/dev/null 2>&1 && tmux send-keys -t ${sessionName} C-c || true`,
        ...buildFreePortLines(listenPort),
        `sleep ${PORT_RELEASE_WAIT_SECONDS}`,
      ].join("\n"),
      { cwd: "/", timeoutSeconds: 20 },
    );

    console.log(
      `[mcp] restart_dev_server: relaunching sandbox=${args.sandboxId} port=${args.devPort}`,
    );
    await launchPreviewDevServer(
      handle,
      args.ownerKey,
      args.devCommand,
      args.devPort,
      args.rootDirectory,
    );
    return { restarted: true, listenPort };
  },
});

const vmStateValidator = v.object({
  running: v.boolean(),
  vmState: v.string(),
});

/**
 * The VM's live state, read without waking it. Tools that hand work to
 * another sandbox action check this first, since that action's first exec
 * would lazily resume a stopped VM.
 */
export const sandboxVmState = internalAction({
  args: { repoId: v.id("githubRepos"), sandboxId: v.string() },
  returns: vmStateValidator,
  handler: async (ctx, args): Promise<Infer<typeof vmStateValidator>> => {
    const vm = await runningHandle(ctx, args.repoId, args.sandboxId);
    if ("state" in vm) return { running: false, vmState: vm.state };
    return { running: true, vmState: vm.handle.state };
  },
});
