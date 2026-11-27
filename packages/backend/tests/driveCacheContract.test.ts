import { describe, expect, test } from "bun:test";
import {
  DRIVE_CACHE_ENV,
  DRIVE_CACHE_ROOT,
  DRIVE_MOUNT_PATH,
  driveCacheSetupScript,
  localCachePruneLines,
} from "../convex/_sandbox/driveCache";
import { snapshotPruneScript } from "../convex/_sandbox/snapshotPrune";

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
    expect(script).not.toMatch(/chmod\s+-R/);
  });
});

describe("snapshot prune never touches the Drive", () => {
  test("prune targets are local caches, never a mounted Drive", () => {
    const script = snapshotPruneScript();
    for (const line of localCachePruneLines()) {
      expect(script).toContain(line);
    }
    const lines = script.split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("rm ")) return;
      expect(line).not.toContain(DRIVE_MOUNT_PATH);
      if (line.includes(DRIVE_CACHE_ROOT)) {
        expect(lines[index - 1]).toBe(
          `if ! mountpoint -q ${DRIVE_CACHE_ROOT} 2>/dev/null; then`,
        );
      }
    });
  });

  test("prune is best-effort and always exits 0", () => {
    const script = snapshotPruneScript();
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
    for (const line of script.split("\n").filter((l) => l.includes("rm "))) {
      expect(line).toContain("|| true");
    }
  });
});
