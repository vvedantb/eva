"use node";

import { z } from "zod";
import type { SandboxHandle } from "../_sandbox/provider";
import {
  ensureDockerDaemon,
  execHandle,
  bootstrapVercelDocker,
  workspaceDirShell,
} from "./helpers";
import { writeSandboxFile } from "./sandboxFiles";
import { ensureSwapFile } from "./swap";

const SUPABASE_DUMP_PATH =
  "/home/eva/.eva-snapshot-state/supabase-db-web.pg_dump.sql.gz";
const SUPABASE_RESTORE_MARKER = "/tmp/.eva-supabase-db-web-restored";

/** Absolute shell path to the package root, defaulting to `baseDir`. */
function packageDirShell(rootDir: string, baseDir: string): string {
  return rootDir ? `${baseDir}/${rootDir}` : baseDir;
}

/**
 * Detects the package manager (pnpm, yarn, or npm) by checking lock files.
 *
 * `baseDir` defaults to the primary repo's workspace root; a linked repo's
 * prep passes its own clone directory instead so detection never looks at
 * `/tmp/repo`. `rootDir` stays relative to `baseDir` for monorepo apps.
 */
export async function detectPackageManager(
  sandbox: SandboxHandle,
  rootDir = "",
  baseDir: string = workspaceDirShell(),
): Promise<string> {
  const dir = packageDirShell(rootDir, baseDir);
  // Prefer the package rootDir, then fall back to baseDir — monorepos often
  // keep pnpm-lock.yaml at the repo root while rootDirectory points at an app.
  // Also treat packageManager / workspace: deps as pnpm so npm never hits workspace:*.
  const detection = (
    await execHandle(
      sandbox,
      [
        `if [ -f ${dir}/pnpm-lock.yaml ] || [ -f ${baseDir}/pnpm-lock.yaml ]; then echo pnpm;`,
        `elif [ -f ${dir}/yarn.lock ] || [ -f ${baseDir}/yarn.lock ]; then echo yarn;`,
        `elif grep -q '"packageManager"[[:space:]]*:[[:space:]]*"pnpm@' ${dir}/package.json ${baseDir}/package.json 2>/dev/null; then echo pnpm;`,
        `elif grep -q 'workspace:' ${dir}/package.json ${baseDir}/package.json 2>/dev/null; then echo pnpm;`,
        `else echo npm; fi`,
      ].join(" "),
      5,
    )
  ).trim();
  if (detection === "pnpm") return "pnpm";
  if (detection === "yarn") return "yarn";
  return "npm";
}

/**
 * Detects a Python install manifest at `baseDir` (default: the primary
 * repo's workspace root). `requirements.txt` wins over `pyproject.toml` when
 * both exist.
 */
export async function detectPythonManifest(
  sandbox: SandboxHandle,
  baseDir: string = workspaceDirShell(),
): Promise<"requirements" | "pyproject" | null> {
  const detection = (
    await execHandle(
      sandbox,
      [
        `if [ -f ${baseDir}/requirements.txt ]; then echo requirements;`,
        `elif [ -f ${baseDir}/pyproject.toml ]; then echo pyproject;`,
        `else echo none; fi`,
      ].join(" "),
      5,
    )
  ).trim();
  if (detection === "requirements") return "requirements";
  if (detection === "pyproject") return "pyproject";
  return null;
}

const PIP_INSTALL_TIMEOUT_SECONDS = 900;

/**
 * Best-effort `pip install --user` for `baseDir`'s requirements.txt /
 * pyproject.toml (default: the primary repo's workspace root). Fresh sandboxes
 * may lack gcc/libpq-devel — failures must not kill the caller. Returns
 * whether an install was attempted and whether it succeeded.
 */
export async function installPythonDependenciesBestEffort(
  sandbox: SandboxHandle,
  baseDir: string = workspaceDirShell(),
): Promise<{ attempted: boolean; ok: boolean }> {
  const kind = await detectPythonManifest(sandbox, baseDir);
  if (!kind) return { attempted: false, ok: true };
  const pipArgs = kind === "requirements" ? "-r requirements.txt" : "-e .";
  try {
    await execHandle(
      sandbox,
      // Match websockify / seed: --break-system-packages then plain --user.
      `cd ${baseDir} && (python3 -m pip install --user --break-system-packages ${pipArgs} || python3 -m pip install --user ${pipArgs})`,
      PIP_INSTALL_TIMEOUT_SECONDS,
    );
    return { attempted: true, ok: true };
  } catch {
    return { attempted: true, ok: false };
  }
}

// Boundary schema for the sandbox package.json. Only the fields dev-port
// detection needs are modelled; anything malformed falls back to empty via
// `.catch`, so detection degrades to framework defaults instead of throwing.
const packageJsonSchema = z
  .object({
    scripts: z.record(z.string(), z.string()).catch({}),
    dependencies: z.record(z.string(), z.string()).catch({}),
    devDependencies: z.record(z.string(), z.string()).catch({}),
  })
  .catch({ scripts: {}, dependencies: {}, devDependencies: {} });

const FRAMEWORK_DEFAULT_PORTS: Record<string, number> = {
  next: 3000,
  nuxt: 3000,
  vite: 5173,
  "@angular/core": 4200,
};

/** Detects the dev server port from package.json scripts or framework defaults. */
export async function detectDevPort(
  sandbox: SandboxHandle,
  rootDir: string,
): Promise<number> {
  const dir = packageDirShell(rootDir, workspaceDirShell());
  try {
    const raw = await execHandle(
      sandbox,
      `cat ${dir}/package.json 2>/dev/null || echo "{}"`,
      5,
    );
    const pkg = packageJsonSchema.parse(JSON.parse(raw));

    const devScript = pkg.scripts.dev ?? "";
    const portMatch = devScript.match(/(?:--port|--p|-p|PORT=)\s*(\d+)/);
    if (portMatch?.[1]) {
      return parseInt(portMatch[1], 10);
    }

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [framework, port] of Object.entries(FRAMEWORK_DEFAULT_PORTS)) {
      if (framework in allDeps) return port;
    }
  } catch {
    // couldn't read package.json
  }
  return 3000;
}

/**
 * Detects package manager and dev port, returning the dev command for the session.
 *
 * `overrides` lets a user-defined config (stored on `githubRepos`) take precedence
 * over auto-detection:
 * - `overrides.devPort` short-circuits port detection.
 * - `overrides.devCommand` is run verbatim — the user owns `cd` and `PORT=`.
 *   We still resolve a port for downstream consumers (preview URL routing) using
 *   the override port, else detection.
 */
export async function startSessionServices(
  sandbox: SandboxHandle,
  rootDir: string,
  overrides?: { devPort?: number; devCommand?: string },
): Promise<{ port: number; devCommand: string }> {
  await restoreSeededRuntimeState(sandbox);

  const port =
    overrides?.devPort !== undefined
      ? overrides.devPort
      : await detectDevPort(sandbox, rootDir);

  if (overrides?.devCommand && overrides.devCommand.trim().length > 0) {
    return {
      port,
      devCommand: `cd ${workspaceDirShell()} && HOSTNAME=0.0.0.0 PORT=${port} ${overrides.devCommand}`,
    };
  }

  const pm = await detectPackageManager(sandbox, rootDir);
  const dir = packageDirShell(rootDir, workspaceDirShell());
  const devCommand = `cd ${dir} && HOSTNAME=0.0.0.0 PORT=${port} ${pm} run dev`;
  return { port, devCommand };
}

/** Restores service state that was exported into a seeded snapshot filesystem. */
export async function restoreSeededRuntimeState(
  sandbox: SandboxHandle,
): Promise<void> {
  try {
    await execHandle(sandbox, `test -f ${SUPABASE_DUMP_PATH}`, 5);
  } catch {
    return;
  }

  try {
    await execHandle(sandbox, `test -f ${SUPABASE_RESTORE_MARKER}`, 5);
    return;
  } catch {
    // No marker means this fresh sandbox still needs its local service state.
  }

  const dockerReady =
    (await ensureDockerDaemon(sandbox)) ||
    (await bootstrapVercelDocker(sandbox));
  if (!dockerReady) {
    console.log(
      `[sandbox] restoreSeededRuntimeState: docker unavailable on ${sandbox.id}, skipping supabase dump restore (startup commands will bootstrap)`,
    );
    return;
  }
  await execHandle(
    sandbox,
    [
      "set -e",
      "set -o pipefail",
      "cd /tmp/repo",
      "if docker ps --filter name=supabase_db_web --filter status=running -q | grep -q .; then",
      '  echo "supabase_db_web already running"',
      "elif docker ps -a --filter name=supabase_db_web -q | grep -q . && docker start supabase_db_web >/dev/null 2>&1; then",
      '  echo "started existing supabase_db_web"',
      "else",
      // `docker start` fails when the snapshot captured a half-cleaned docker
      // state (e.g. `supabase stop` pruned the network but a stopped container
      // survived). Wipe any leftover supabase containers so `pnpm start-db`
      // recreates the network + containers from scratch.
      "  docker ps -aq --filter name=supabase | xargs -r docker rm -f",
      "  pnpm start-db",
      "fi",
      "for i in $(seq 1 240); do",
      "  if docker exec supabase_db_web pg_isready -U postgres >/dev/null 2>&1; then break; fi",
      "  sleep 1",
      "done",
      "docker exec supabase_db_web pg_isready -U postgres >/dev/null 2>&1",
      // Resume wakes an already-populated Postgres. The skip marker lives in
      // /tmp and does not survive Vercel stop, so a dump + no marker used to
      // TRUNCATE public and reload — wiping session data and failing when the
      // dump is ahead of the live schema (relation "X" does not exist).
      'table_count=$(docker exec supabase_db_web psql -U postgres -d postgres -tAc "SELECT count(*) FROM pg_tables WHERE schemaname = \'public\'" | tr -d "[:space:]")',
      'if [ "${table_count:-0}" -gt 0 ]; then',
      '  echo "public schema already has tables; skipping seeded dump restore"',
      `  touch ${SUPABASE_RESTORE_MARKER}`,
      "else",
      `  docker exec supabase_db_web psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DO \\$\\$ DECLARE tables text; BEGIN SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables FROM pg_tables WHERE schemaname = 'public'; IF tables IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ' || tables || ' CASCADE'; END IF; END \\$\\$;" >/tmp/eva-supabase-db-web-truncate.log 2>&1 || { tail -120 /tmp/eva-supabase-db-web-truncate.log; exit 1; }`,
      `  gzip -dc ${SUPABASE_DUMP_PATH} | docker exec -i supabase_db_web psql -U postgres -d postgres -v ON_ERROR_STOP=1 >/tmp/eva-supabase-db-web-restore.log 2>&1 || { tail -120 /tmp/eva-supabase-db-web-restore.log; exit 1; }`,
      `  touch ${SUPABASE_RESTORE_MARKER}`,
      '  echo "restored supabase_db_web from seeded snapshot dump"',
      "fi",
      // Join with newlines, not "; ": the script contains if/elif/else/for
      // blocks, and "then; ", "else; ", "do; " are bash syntax errors
      // ("syntax error near unexpected token ';'"). Newlines terminate those
      // keywords correctly and are valid statement separators everywhere else.
    ].join("\n"),
    600,
  );
}

/** Stable default terminal pane id — must match `sandboxPanes.defaultPane`. */
export function defaultTerminalPtyId(ownerKey: string): string {
  return `${ownerKey}-terminal-default`;
}

const EVA_ENV_FILE = "/vercel/sandbox/.eva-env.sh";

const DEVSERVER_LOCK = "/tmp/eva-devserver.lock";
const DEVSERVER_LAST_LAUNCH = "/tmp/eva-devserver-last-launch";
const DEVSERVER_RELAUNCH_COOLDOWN_SECONDS = 20;

/** Starts the dev server detached so preview can load without an open terminal tab. */
export async function launchDevServerInBackground(
  sandbox: SandboxHandle,
  devCommand: string,
  port: number,
): Promise<void> {
  const launchState = (
    await execHandle(
      sandbox,
      [
        `LOCK=${DEVSERVER_LOCK}`,
        `LAST=${DEVSERVER_LAST_LAUNCH}`,
        'pid=$(cat "$LOCK" 2>/dev/null || true)',
        'if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo active; exit 0; fi',
        "now=$(date +%s)",
        'last=$(cat "$LAST" 2>/dev/null || echo 0)',
        `if [ $((now - last)) -lt ${DEVSERVER_RELAUNCH_COOLDOWN_SECONDS} ]; then echo recent; exit 0; fi`,
        'echo "$now" > "$LAST"',
        "echo launch",
      ].join("; "),
      5,
      "/",
    )
  ).trim();
  if (launchState !== "launch") {
    return;
  }

  // Detached launcher used by the task-only dev server re-run
  // (runDevServerInTaskSandbox), which reaches a running sandbox without a boot
  // step. Guarded like the Console launcher so a cold compile cannot spike into
  // a swapless VM. Placed after the lock check: no-op relaunches pay nothing.
  await ensureSwapFile(sandbox);

  const script = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `[ -f ${EVA_ENV_FILE} ] && . ${EVA_ENV_FILE}`,
    `WORKSPACE_DIR=${workspaceDirShell()}`,
    'cd "$WORKSPACE_DIR"',
    'export INIT_CWD="$WORKSPACE_DIR"',
    `LOCK=${DEVSERVER_LOCK}`,
    'if [ -f "$LOCK" ]; then',
    '  oldpid=$(cat "$LOCK" 2>/dev/null || true)',
    '  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then',
    "    exit 0",
    "  fi",
    "fi",
    `if command -v fuser >/dev/null 2>&1; then fuser -k ${port}/tcp >/dev/null 2>&1 || true`,
    `elif command -v lsof >/dev/null 2>&1; then for p in $(lsof -ti :${port} 2>/dev/null || true); do kill "$p" 2>/dev/null || true; done`,
    "fi",
    'echo $$ > "$LOCK"',
    "trap 'rm -f \"$LOCK\"' EXIT",
    // Cap the dev server's V8 heap: one leaky Next dev compile at ~5.5GB RSS
    // was enough to trigger kernel OOM kills of unrelated processes on a 16GB
    // VM. A clean heap error is the recoverable failure — the preview
    // self-heal (ensureSessionPreviewServices) relaunches the server. Ours
    // goes first so an env- or repo-provided NODE_OPTIONS still wins.
    'export NODE_OPTIONS="--max-old-space-size=6144${NODE_OPTIONS:+ $NODE_OPTIONS}"',
    devCommand,
  ].join("\n");
  await writeSandboxFile(sandbox, "/tmp/eva-launch-devserver.sh", script);
  await sandbox.execDetached(
    "chmod +x /tmp/eva-launch-devserver.sh && /tmp/eva-launch-devserver.sh >> /tmp/devserver.log 2>&1",
    { timeoutSeconds: 15 },
  );
  console.log(
    `[sandbox] launchDevServerInBackground: launched on ${sandbox.id} port=${port}`,
  );
}
