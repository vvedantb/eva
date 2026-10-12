/**
 * Shrinks a sandbox's disk immediately before a snapshot is captured.
 *
 * WHY: a seeded snapshot is written once per repo and then restored by every
 * session, task and project sandbox for that repo, so anything sitting on disk
 * at capture time is paid for in snapshot storage forever. Measured on a live
 * seeded sandbox (2026-09-23, 18 GB of 32 GB used), several GB of it was
 * avoidable: duplicate copies of one 189 MB binary, a spent 195 MB installer,
 * package-manager metadata, and the local caches the Drive replaced.
 *
 * None of this moves to a Drive. It is content nothing reads again (or, for
 * the Convex binary, content already on disk once), so persistent storage
 * billed per GB-month plus per-GB reads would be strictly worse than deleting
 * or de-duplicating it.
 *
 * ## Safety rules for anything added here
 *
 * Every target must be (a) reconstructible by re-running the tool that made it
 * and (b) not load-bearing for a restored sandbox. Caches and installers
 * qualify; installed programs, repo files and user state never do. The script
 * is best-effort throughout and always exits 0: losing a snapshot to a failed
 * `rm` would cost far more than the space it saves.
 */

import { driveRedundantLocalPruneLines } from "./driveCache";

/** Home directories that may hold tool caches. Both users exist on the image. */
const HOME_DIRS = ["/home/vercel-sandbox", "/home/eva", "/root"];

/**
 * Collapses the identical Convex local-backend copies into one file.
 *
 * `buildConvexBackgroundScriptBody` (../_sandbox_runtime/convexLocalBackend.ts)
 * plants Eva's one pinned glibc-compatible build under every label the CLI
 * might ask for (the pin, the expected latest, and whatever version.convex.dev
 * says is latest today), as a full `shutil.copy2` per label. The labels pile
 * up as Convex's "latest" moves: a seeded sandbox measured 2026-10-06 held
 * four ~189 MB copies with the same sha256.
 *
 * Hard links rather than deletion. Deleting a label only makes the next
 * `convex dev` start copy it back (its `planted()` check sees it missing), so
 * the space returns on every sandbox and the snapshot saving is paid for again
 * at runtime. A hard link keeps every label present and passing `planted()`
 * (file plus `.eva-glibc-pin` marker), while the snapshot stores one copy.
 * Only byte-identical files are linked (`cmp -s`), so a label holding a
 * different build is never touched.
 */
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
 * Ordered largest-first so a timeout still gets the big wins.
 */
export function snapshotPruneScript(): string {
  return [
    // Local caches the Drive now holds (~3.8 GB measured). Without this the
    // Drive only ADDS storage: the old copies stay baked into every snapshot.
    ...driveRedundantLocalPruneLines(HOME_DIRS),
    ...HOME_DIRS.map(dedupeConvexBinaries),
    ...HOME_DIRS.map(pruneSpentInstallers),
    // dnf's metadata cache: 167 MB, rebuilt automatically on the next install.
    `sudo dnf clean all >/dev/null 2>&1 || true`,
    `sudo rm -rf /var/cache/dnf/* 2>/dev/null || true`,
    `exit 0`,
  ].join("\n");
}
