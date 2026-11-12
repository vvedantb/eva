import { describe, expect, test } from "vitest";
import {
  DRIVE_CACHE_ENV,
  DRIVE_CACHE_ROOT,
  DRIVE_MOUNT_PATH,
  driveCacheSetupScript,
  driveRedundantLocalPruneLines,
} from "../convex/_sandbox/driveCache";
import { snapshotPruneScript } from "../convex/_sandbox/snapshotPrune";

/**
 * The setup script runs at create AND on every resume, so it must be
 * idempotent, never fail, and probe the mount instead of trusting the role:
 * a write-lock clash demotes a writer to a read-only snapshot.
 */
describe("driveCacheSetupScript", () => {
  const script = driveCacheSetupScript();

  test("exits early when the cache root is already a mount", () => {
    expect(script).toContain(`mountpoint -q ${DRIVE_CACHE_ROOT}`);
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
  });

  test("probes writability before bind-mounting the Drive", () => {
    const probeAt = script.indexOf(`touch ${DRIVE_MOUNT_PATH}/`);
    const bindAt = script.indexOf("mount --bind");
    const overlayAt = script.indexOf("mount -t overlay");
    expect(probeAt).toBeGreaterThan(-1);
    expect(probeAt).toBeLessThan(bindAt);
    // A read-only Drive gets an overlay, never a bind.
    expect(bindAt).toBeLessThan(overlayAt);
  });

  test("creates and opens every cache dir the env points at", () => {
    for (const dir of Object.values(DRIVE_CACHE_ENV)) {
      expect(dir.startsWith(`${DRIVE_CACHE_ROOT}/`)).toBe(true);
      expect(script).toMatch(new RegExp(`mkdir -p [^\\n]*${dir}`));
      expect(script).toMatch(new RegExp(`chmod 777 [^\\n]*${dir}`));
    }
  });

  test("chmod is not recursive", () => {
    // A recursive chmod walks the whole warm package store on every create.
    expect(script).not.toMatch(/chmod\s+-R/);
  });
});

/**
 * The prune deletes local caches the Drive replaced. It must run after the
 * teardown unmounts the cache, or `rm` empties the Drive itself.
 */
describe("snapshot prune never touches the Drive", () => {
  test("prune targets are home-dir caches, never the Drive paths", () => {
    const script = snapshotPruneScript();
    for (const line of driveRedundantLocalPruneLines(["/home/eva"])) {
      expect(script).toContain(line);
    }
    for (const line of script.split("\n").filter((l) => l.includes("rm "))) {
      expect(line).not.toContain(DRIVE_CACHE_ROOT);
      expect(line).not.toContain(DRIVE_MOUNT_PATH);
    }
  });

  test("prune is best-effort and always exits 0", () => {
    const script = snapshotPruneScript();
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
    for (const line of script.split("\n").filter((l) => l.includes("rm "))) {
      expect(line).toContain("|| true");
    }
  });
});
