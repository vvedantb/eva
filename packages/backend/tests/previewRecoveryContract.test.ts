import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const sandboxExecution = readSource("convex/_sandbox_runtime/execution.ts");
const previewRecovery = readSource(
  "convex/_sandbox_runtime/previewRecovery.ts",
);
const previewProxy = readSource("convex/_sandbox_runtime/previewProxy.ts");

/**
 * Nothing watches the dev server or the navigation proxy after launch. An OOM
 * kill (observed in prod: the kernel killed next-server twice in one boot) or
 * a lazily-resumed VM leaves the app port dead while the sandbox runs; the
 * proxy is only ensured on a PASSING probe, so both stay down and the user
 * has to ask the agent to restart them. The readiness poll is the only thing
 * that notices — these rules pin the recovery path it now triggers.
 */
describe("a dead dev server recovers through the Console launcher", () => {
  test("the poll schedules recovery only on a claimed heal with a failed probe", () => {
    // `getPreviewUrl`'s body lives in `buildPreviewUrl`, shared with the MCP
    // get_preview_url path — so the poll rules are pinned where they run.
    const body = previewUrlBody();
    const probeAt = body.indexOf("probePreviewReady(");
    const recoveryAt = body.indexOf("ensureSessionPreviewServices");
    expect(probeAt, "the readiness probe moved").toBeGreaterThan(-1);
    expect(recoveryAt, "the recovery schedule moved").toBeGreaterThan(-1);
    expect(probeAt).toBeLessThan(recoveryAt);

    const gate = body.slice(probeAt, recoveryAt);
    expect(gate).toContain("!ready");
    expect(gate).toContain("healClaimed");
  });

  test("the poll itself never launches the app", () => {
    // Lifecycle owns Console as the single launcher; recovery goes through a
    // scheduled action, never inline from the poll.
    const body = previewUrlBody();
    expect(body).not.toContain("launchPreviewDevServer");
    expect(body).not.toContain("launchDevServerInVercelConsole");
  });

  // recoverPreviewOwner is one shared guard+recovery function called once per
  // owner kind (session, task, project) — the status/port/state guards below
  // are its property now, not any one owner's. Each owner's own field mapping
  // (which status field, which owner key) is pinned separately below against
  // its PreviewOwnerConfig.
  test("recovery stands down while startup owns the launch (shared across every owner)", () => {
    // The startup flow resolves the real port and launches the dev server
    // itself; a recovery racing it with a stale sticky devPort launched a
    // duplicate server on the wrong port (prod: 13000 by startup, 3001 by
    // recovery one second later).
    const body = functionBody(
      previewRecovery,
      "async function recoverPreviewOwner<TEntity>(",
    );
    const startingGuardAt = body.indexOf('status === "starting"');
    const launchAt = body.indexOf("launchPreviewDevServer(");
    expect(startingGuardAt, "the starting guard moved").toBeGreaterThan(-1);
    expect(startingGuardAt).toBeLessThan(launchAt);
  });

  test("agents are told the dev server is managed and warming up", () => {
    // "No Next server is running" seconds after a sandbox start → the agent
    // launches its own → duplicate dev servers → OOM. The edit prompt names
    // the port, the auto-start, the compile delay, and the ban.
    const prompts = readSource("convex/_sessions/prompts.ts");
    expect(prompts).toContain("App dev server (managed by Eva)");
    expect(prompts).toContain("NEVER start your own dev server");
    expect(prompts).toContain("A cold compile takes 1-2 minutes");
  });

  test("recovery relaunches via the Console launcher, guarded (shared across every owner)", () => {
    const body = functionBody(
      previewRecovery,
      "async function recoverPreviewOwner<TEntity>(",
    );
    const stateGuardAt = body.indexOf('handle.state !== "running"');
    const portGuardAt = body.indexOf("devPort !== args.expectedPort");
    const launchAt = body.indexOf("launchPreviewDevServer(");
    expect(stateGuardAt, "the non-running guard moved").toBeGreaterThan(-1);
    expect(portGuardAt, "the port guard moved").toBeGreaterThan(-1);
    expect(launchAt, "the launcher call moved").toBeGreaterThan(-1);
    // Never exec on a stopped sandbox, and never fight a secondary app tab's
    // own dev server.
    expect(stateGuardAt).toBeLessThan(launchAt);
    expect(portGuardAt).toBeLessThan(launchAt);
  });

  test.each([
    {
      name: "sessionOwnerConfig",
      statusField: "session.status",
      devPortField: "session.devPort",
      ownerKeyLiteral: "`session-${session._id}`",
    },
    {
      name: "taskOwnerConfig",
      statusField: "task.reviewTaskSandboxStatus",
      devPortField: "task.devPort",
      ownerKeyLiteral: "`task-${task._id}`",
    },
    {
      name: "projectOwnerConfig",
      statusField: "project.reviewProjectSandboxStatus",
      devPortField: "project.devPort",
      ownerKeyLiteral: "`project-${project._id}`",
    },
  ])(
    "$name maps status, devPort and Console owner key onto its own entity",
    ({ name, statusField, devPortField, ownerKeyLiteral }) => {
      const body = configBody(previewRecovery, name);
      expect(body).toContain(statusField);
      expect(body).toContain(devPortField);
      // Console visibility: each owner relaunches under its own PTY owner key.
      expect(body).toContain(ownerKeyLiteral);
    },
  );
});

/**
 * A sandbox can also be owned by a quick task or a project chat, not just a
 * session — the readiness poll that schedules this action only knows
 * sandboxId/port, so the owner has to be resolved here by sandbox id. Each
 * owner type keeps the same guards as sessions, just against its own fields.
 */
describe("preview recovery falls back to task and project owners", () => {
  test("a task owner is checked when no session owns the sandbox", () => {
    const body = definitionBody(
      previewRecovery,
      "ensureSessionPreviewServices",
    );
    const sessionAt = body.indexOf("internal.sessions.getBySandboxInternal");
    const taskAt = body.indexOf("internal.agentTasks.getBySandboxInternal");
    expect(sessionAt, "the session lookup moved").toBeGreaterThan(-1);
    expect(taskAt, "the task lookup moved").toBeGreaterThan(-1);
    expect(sessionAt).toBeLessThan(taskAt);

    // The task branch must route through the same shared guard+recovery
    // function, bound to the task's own config — not a separate copy.
    const taskBranch = body.slice(taskAt);
    expect(taskBranch).toContain('recoverPreviewOwner<Doc<"agentTasks">>(');
    expect(taskBranch).toContain("taskOwnerConfig");
  });

  test("a project owner is checked last, after session and task", () => {
    const body = definitionBody(
      previewRecovery,
      "ensureSessionPreviewServices",
    );
    const taskAt = body.indexOf("internal.agentTasks.getBySandboxInternal");
    const projectAt = body.indexOf("internal.projects.getBySandboxInternal");
    expect(projectAt, "the project lookup moved").toBeGreaterThan(-1);
    expect(taskAt).toBeLessThan(projectAt);

    const projectBranch = body.slice(projectAt);
    expect(projectBranch).toContain('recoverPreviewOwner<Doc<"projects">>(');
    expect(projectBranch).toContain("projectOwnerConfig");
  });
});

/**
 * The proxy runs detached with no supervisor, so one uncaught throw killed it
 * and took the preview down until someone asked for a restart.
 */
describe("the preview proxy survives uncaught errors", () => {
  test("the generated script installs process-level handlers", () => {
    expect(previewProxy).toContain('process.on("uncaughtException"');
    expect(previewProxy).toContain('process.on("unhandledRejection"');
  });
});

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** The shared preview-URL body both `getPreviewUrl` and the MCP tool run. */
function previewUrlBody(): string {
  return functionBody(sandboxExecution, "async function buildPreviewUrl(");
}

/** One top-level function, ending on the `\n}` that closes it at column 0. */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** One `const name: SomeConfig<...> = {...}` object literal, ending on the `\n};` that closes it. */
function configBody(source: string, name: string): string {
  const startAt = source.indexOf(`const ${name}:`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n};", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
