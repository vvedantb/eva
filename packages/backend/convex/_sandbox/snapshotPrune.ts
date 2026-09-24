/**
 * Drops regenerable junk from a sandbox's disk immediately before a snapshot
 * is captured.
 *
 * WHY: a seeded snapshot is written once per repo and then restored by every
 * session, task and project sandbox for that repo, so anything sitting on disk
 * at capture time is paid for in snapshot storage forever. Measured on a live
 * seeded sandbox (2026-09-23, 18 GB of 32 GB used), ~740 MB of that was pure
 * waste: superseded copies of a 189 MB binary, a spent 195 MB installer, and
 * package-manager metadata.
 *
 * This is deliberately a prune and NOT a Drive. Moving these to persistent
 * storage would relocate the garbage to something billed per GB-month plus
 * per-GB reads — strictly worse than deleting it. Drives are for content that
 * is re-read (see ./driveCache.ts); this is content nothing reads again.
 *
 * ## Safety rules for anything added here
 *
 * Every target must be (a) reconstructible by re-running the tool that made it
 * and (b) not load-bearing for a restored sandbox. Caches and installers
 * qualify; installed binaries, repo files and user state never do. The script
 * is best-effort throughout and always exits 0 — losing a snapshot to a failed
 * `rm` would cost far more than the space it saves.
 */

/** Home directories that may hold tool caches. Both users exist on the image. */
const HOME_DIRS = ["/home/vercel-sandbox", "/home/eva", "/root"];

/**
 * Convex downloads a ~189 MB precompiled local backend per release and never
 * evicts the old ones — three were resident on the sandbox measured above, of
 * which one was live. Keeps the most recently modified and drops the rest.
 */
function pruneConvexBinaries(home: string): string {
  const dir = `${home}/.cache/convex/binaries`;
  return [
    `if [ -d ${dir} ]; then`,
    // -maxdepth/-mindepth 1 so the parent is never a deletion candidate.
    `  ls -1dt ${dir}/*/ 2>/dev/null | tail -n +2 | while read -r old; do sudo rm -rf "$old" 2>/dev/null || true; done`,
    `fi`,
  ].join("\n");
}

/**
 * Downloaded package files left behind after the package they carry has been
 * installed. code-server's installer keeps its 195 MB .rpm indefinitely; dnf
 * keeps its repo metadata. Both re-download on demand.
 */
function pruneSpentInstallers(home: string): string {
  return [
    `sudo rm -f ${home}/.cache/code-server/*.rpm 2>/dev/null || true`,
    `sudo rm -f ${home}/.cache/code-server/*.deb 2>/dev/null || true`,
  ].join("\n");
}

/**
 * Shell run just before `sandbox.snapshot()`. Idempotent and always exits 0.
 * Ordered cheapest-first so a timeout still gets the large wins.
 */
export function snapshotPruneScript(): string {
  return [
    ...HOME_DIRS.map(pruneConvexBinaries),
    ...HOME_DIRS.map(pruneSpentInstallers),
    // dnf's metadata cache: 167 MB, rebuilt automatically on the next install.
    `sudo dnf clean all >/dev/null 2>&1 || true`,
    `sudo rm -rf /var/cache/dnf/* 2>/dev/null || true`,
    `exit 0`,
  ].join("\n");
}
