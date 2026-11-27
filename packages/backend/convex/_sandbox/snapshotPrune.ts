import { localCachePruneLines, SANDBOX_HOME_DIRS } from "./driveCache";

function dedupeConvexBinaries(home: string): string {
  const dir = `${home}/.cache/convex/binaries`;
  return [
    `if [ -d ${dir} ]; then`,
    `  eva_first=""`,
    `  for eva_bin in ${dir}/*/convex-local-backend; do`,
    `    [ -f "$eva_bin" ] || continue`,
    `    if [ -z "$eva_first" ]; then eva_first="$eva_bin"; continue; fi`,
    `    cmp -s "$eva_first" "$eva_bin" && sudo ln -f "$eva_first" "$eva_bin" 2>/dev/null || true`,
    `  done`,
    `fi`,
  ].join("\n");
}

function pruneSpentInstallers(home: string): string {
  return [
    `sudo rm -f ${home}/.cache/code-server/*.rpm 2>/dev/null || true`,
    `sudo rm -f ${home}/.cache/code-server/*.deb 2>/dev/null || true`,
  ].join("\n");
}

/**
 * Shell run just before `sandbox.snapshot()`. Idempotent and always exits 0.
 * Ordered largest-first so a timeout still gets the big wins.
 */
export function snapshotPruneScript(): string {
  return [
    ...localCachePruneLines(),
    ...SANDBOX_HOME_DIRS.map(dedupeConvexBinaries),
    ...SANDBOX_HOME_DIRS.map(pruneSpentInstallers),
    `sudo dnf clean all >/dev/null 2>&1 || true`,
    `sudo rm -rf /var/cache/dnf/* 2>/dev/null || true`,
    `exit 0`,
  ].join("\n");
}
