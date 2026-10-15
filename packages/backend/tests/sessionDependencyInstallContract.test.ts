import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { dependencyInstallCommand } from "../convex/_sandbox_runtime/git";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const git = readSource("convex/_sandbox_runtime/git.ts");
const sessions = readSource("convex/_sandbox_runtime/sessions.ts");
const devServer = readSource("convex/_sandbox_runtime/devServer.ts");

/**
 * Both install paths — snapshot (installSnapshotDependenciesWithRetry) and
 * fresh clone (installDependencies) — build their shell via the one
 * dependencyInstallCommand helper, so these pin its output directly.
 */
describe("dependency install commands", () => {
  test("yarn bootstraps the shim first", () => {
    // No sandbox base image ships a yarn shim, so a bare `yarn install` exits 127
    // (fix 820990c4 / 457b046b).
    const command = dependencyInstallCommand("yarn", "/w");
    expect(command.startsWith("npm install -g yarn &&")).toBe(true);
    expect(command).toContain("yarn install");
  });

  test("pnpm may purge node_modules without a TTY prompt", () => {
    // DRIVE_CACHE_ENV moved the pnpm store, so old snapshots make pnpm purge
    // node_modules; without this flag it fails with
    // ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
    const command = dependencyInstallCommand("pnpm", "/w");
    expect(command.startsWith("npm install -g pnpm &&")).toBe(true);
    expect(command).toContain(
      "pnpm install --config.confirm-modules-purge=false",
    );
  });

  test("npm installs in place", () => {
    expect(dependencyInstallCommand("npm", "/w")).toBe("cd /w && npm install");
  });

  test("the snapshot path uses the shared helper", () => {
    expect(sessions).toContain("dependencyInstallCommand(pm, installCwd)");
    expect(sessions).not.toContain("pnpm install");
  });
});

/**
 * A Python-only change (requirements.txt / pyproject.toml) must not trigger a
 * Node reinstall — on a yarn repo that reinstall can fail and kill the whole
 * session. lockfileDrifted returns a per-ecosystem verdict and the caller
 * guards each install with its own flag (fix 820990c4).
 */
describe("Node and Python dependency drift are tracked apart", () => {
  test("lockfileDrifted reports node and python separately", () => {
    expect(sessions).toContain("Promise<{ node: boolean; python: boolean }>");
    // Separate shell markers, so a python-path diff cannot masquerade as node.
    expect(sessions).toContain("NODE_DRIFT");
    expect(sessions).toContain("PY_DRIFT");
    // The python probe watches the real manifests.
    const probe = sessions.slice(sessions.indexOf("PY_SAME") - 200);
    expect(probe).toContain("requirements.txt");
    expect(probe).toContain("pyproject.toml");
  });

  test("each install runs only when its own manifest drifted", () => {
    const region = sliceFrom(
      sessions,
      "let drift = {",
      "clearSandboxSetupPending",
    );
    // No baked snapshot means we cannot diff, so install everything.
    expect(region).toContain("node: true, python: true");

    const nodeGuardAt = region.indexOf("if (drift.node)");
    const nodeInstallAt = region.indexOf(
      "installSnapshotDependenciesWithRetry(handle",
    );
    const pyGuardAt = region.indexOf("if (drift.python)");
    const pyInstallAt = region.indexOf(
      "installPythonDependenciesBestEffort(handle",
    );
    expect(nodeGuardAt, "the node drift guard moved").toBeGreaterThan(-1);
    expect(pyGuardAt, "the python drift guard moved").toBeGreaterThan(-1);
    // Each install sits inside its own guard — never unconditional.
    expect(nodeGuardAt).toBeLessThan(nodeInstallAt);
    expect(pyGuardAt).toBeLessThan(pyInstallAt);
  });
});

/**
 * Fresh clones grew Python support too: cloneAndSetupRepo installs pip deps
 * after the node install (fix 457b046b), and the shared helper must stay
 * best-effort — a fresh image can lack gcc/libpq, and a failing pip install
 * must never throw and abort clone setup.
 */
describe("fresh clones install Python deps best-effort", () => {
  test("cloneAndSetupRepo installs python deps after node deps", () => {
    const nodeAt = git.indexOf("await installDependencies(sandbox, pm)");
    const pythonAt = git.indexOf("await installPythonDependencies(sandbox)");
    expect(nodeAt, "the node install call moved").toBeGreaterThan(-1);
    expect(pythonAt, "the python install call moved").toBeGreaterThan(-1);
    expect(nodeAt).toBeLessThan(pythonAt);
  });

  test("the shared pip helper skips cleanly and never throws", () => {
    const body = functionBody(
      devServer,
      "export async function installPythonDependenciesBestEffort(",
    );
    // No manifest is a clean skip, reported as a success so callers do not log.
    expect(body).toContain("attempted: false, ok: true");
    // Externally-managed images reject a plain --user; fall back after trying
    // --break-system-packages first.
    expect(body).toContain("--break-system-packages");
    expect(body).toContain("||");
    // A failed install is swallowed into ok:false, never rethrown.
    expect(body).toContain("catch");
    expect(body).toContain("attempted: true, ok: false");
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** One top-level function, ending on the `\n}` that closes it at column 0. */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** The half-open span between two literal markers, for scoping a call site. */
function sliceFrom(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const startAt = source.indexOf(startMarker);
  expect(startAt, `${startMarker} moved`).toBeGreaterThan(-1);
  const endAt = source.indexOf(endMarker, startAt);
  return source.slice(startAt, endAt < 0 ? undefined : endAt);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
