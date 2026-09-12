import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  COREPACK_SANDBOX_ENV,
  renderEvaEnvFile,
} from "../convex/_sandbox/vercelEnvFile";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string =>
  readFileSync(join(backendDir, rel), "utf8");

const snapshotActions = readSource("convex/snapshotActions.ts");
const git = readSource("convex/_sandbox_runtime/git.ts");

/**
 * Incident 2026-09-08: carepulse-ts staging moved its `packageManager` pin to
 * pnpm 12. pnpm 11+ no longer reads `onlyBuiltDependencies`, so pnpm 12
 * skipped the `supabase` postinstall as an unapproved build script, exit 0,
 * and every seeded build died later at `supabase start` with exit 127. The
 * install output that named the skipped script was never persisted, and an
 * unpinned repo would have met the same pnpm 12 through npm `latest`.
 */
describe("Corepack never follows npm `latest` inside a sandbox", () => {
  test("the shared env turns off latest-lookup and the download prompt", () => {
    expect(COREPACK_SANDBOX_ENV).toEqual({
      COREPACK_DEFAULT_TO_LATEST: "0",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    });
    expect(renderEvaEnvFile(COREPACK_SANDBOX_ENV)).toBe(
      "export COREPACK_DEFAULT_TO_LATEST='0'\nexport COREPACK_ENABLE_DOWNLOAD_PROMPT='0'\n",
    );
  });

  test("session sandboxes get it from the env file, below repo overrides", () => {
    const spread = git.indexOf("...COREPACK_SANDBOX_ENV,");
    const repoVars = git.indexOf("...sandboxEnvVars,", spread);
    expect(spread).toBeGreaterThan(-1);
    expect(repoVars).toBeGreaterThan(spread);
  });

  test("the detached seed script exports the same env, not a private copy", () => {
    expect(snapshotActions).toContain(
      "renderEvaEnvFile(COREPACK_SANDBOX_ENV).trimEnd()",
    );
    expect(snapshotActions).not.toMatch(/export COREPACK_[A-Z_]+=/);
  });
});

describe("seed install output survives to the failure diagnostics", () => {
  test("pnpm install is tee'd, stays fatal on failure, and flags skipped builds", () => {
    const install = snapshotActions.match(
      /pnpm install --frozen-lockfile 2>&1 \| tee \/tmp\/seed-install\.log; \[ "\$\{PIPESTATUS\[0\]\}" -eq 0 \] \|\| \{ echo "SEEDRUN-FAILED:install"; exit 1; \}; grep -q "Ignored build scripts" \/tmp\/seed-install\.log && echo "SEEDRUN-WARN:ignored-build-scripts"/,
    );
    expect(install).not.toBeNull();
  });

  test("diagnostics report the resolved package manager, install warnings and disk", () => {
    const diagnostics = snapshotActions.slice(
      snapshotActions.indexOf("export const fetchSeedDiagnostics"),
      snapshotActions.indexOf("export const pollSeedRun"),
    );
    expect(diagnostics).toContain("corepack --version");
    expect(diagnostics).toContain("pnpm --version");
    expect(diagnostics).toContain("packageManager");
    expect(diagnostics).toContain("lastKnownGood.json");
    expect(diagnostics).toContain("/tmp/seed-install.log");
    expect(diagnostics).toContain("Ignored build");
    expect(diagnostics).toContain("df -h /");
  });
});
