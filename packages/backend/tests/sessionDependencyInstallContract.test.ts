import { describe, expect, test } from "vitest";
import { dependencyInstallCommand } from "../convex/_sandbox_runtime/git";

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
});
