/**
 * Shared package-manager cache backed by a Vercel Drive.
 *
 * WHY: eva bakes `node_modules` into seeded snapshots, so a warm session never
 * installs. Everything that MISSES that snapshot still pays a full cold
 * download: the seed build itself (`launchSeedRun`'s buildCommands), the group
 * builder's per-linked-repo installs, a fresh clone with no snapshot yet, and
 * any `pnpm add` the agent runs mid-session. A Drive is persistent storage that
 * outlives both the sandbox and its snapshots, so those downloads happen once
 * per repo instead of once per sandbox.
 *
 * ## The one-writer rule shapes the whole design
 *
 * A Drive accepts exactly ONE read-write mount at a time; every other sandbox
 * must mount a read-only snapshot of it (`drive.snapshot()`), frozen at mount
 * time. So roles are split:
 *
 * - {@link DRIVE_CACHE_WRITER} — the seed-prep and group-builder sandboxes.
 *   There is at most one per repo at a time (the snapshot workflow serialises
 *   them) and they are exactly where the expensive installs run, so they take
 *   the read-write mount and populate the cache.
 * - {@link DRIVE_CACHE_READER} — every session, task and project sandbox.
 *   Read-only snapshot mount: they consume what the last build wrote.
 *
 * ## Why readers still get a writable cache
 *
 * Package managers write to their own cache even on a cache hit (metadata,
 * lockfiles, new packages), so pointing pnpm straight at a read-only mount
 * fails. Readers therefore overlay a tmpfs-backed upper dir on top of the
 * read-only mount (verified available: Vercel Sandbox has `overlay` in
 * /proc/filesystems and passwordless sudo). Reads fall through to the Drive,
 * writes land locally and are discarded with the sandbox.
 *
 * ## Failure is always a no-op, never an error
 *
 * Mount paths and env vars are fixed, but the bytes behind them are optional.
 * If the Drive cannot be created, cannot be attached (another sandbox holds the
 * write lock), or the overlay refuses to mount, {@link driveCacheSetupScript}
 * falls back to a plain empty local directory. The cache is then cold — exactly
 * today's behaviour — and nothing else changes. Nothing in this module may ever
 * fail a sandbox create.
 */

/** Where Vercel attaches the Drive. Never referenced by build tooling directly. */
export const DRIVE_MOUNT_PATH = "/eva-drive";

/**
 * The cache root every package manager is pointed at. Always exists and is
 * always writable: it is the Drive itself (writer), an overlay over the Drive
 * (reader), or a plain empty directory (no Drive). Keeping it stable is what
 * lets the env file below be identical in all three cases.
 */
export const DRIVE_CACHE_ROOT = "/eva-cache";

/**
 * Detaches the cache before an explicit snapshot capture, so what gets baked is
 * an empty directory rather than a live mount. A snapshot captures the sandbox
 * root filesystem and should not traverse into another mount, but the seeded
 * snapshot is the one artefact every session boots from — the cost of being
 * wrong there is a permanently fat snapshot on every repo, so it is worth one
 * cheap `umount`. Best-effort and always exits 0: an unmountable cache (busy,
 * never mounted) must not fail a capture.
 */
export function driveCacheTeardownScript(): string {
  return [
    `sudo umount -l ${DRIVE_CACHE_ROOT} 2>/dev/null || true`,
    `sudo rm -rf ${OVERLAY_UPPER} ${OVERLAY_WORK} 2>/dev/null || true`,
    `exit 0`,
  ].join("\n");
}

/** Upper/work dirs for the reader overlay. Local to the sandbox, discarded on delete. */
const OVERLAY_UPPER = "/var/tmp/eva-cache-upper";
const OVERLAY_WORK = "/var/tmp/eva-cache-work";

/**
 * How a sandbox uses the repo cache Drive.
 * - `writer`: read-write mount (seed prep / group builder — one per repo).
 * - `reader`: read-only snapshot mount (sessions, tasks, projects).
 */
export const DRIVE_CACHE_WRITER = "writer";
export const DRIVE_CACHE_READER = "reader";
export type DriveCacheRole =
  | typeof DRIVE_CACHE_WRITER
  | typeof DRIVE_CACHE_READER;

/**
 * Drive name for a repo's cache. Names are unique per Vercel project, and
 * `repoId` is a stable Convex id, so this is the natural key. Prefixed so the
 * drives are identifiable in the Vercel dashboard alongside non-eva drives.
 */
export function driveCacheName(repoId: string): string {
  return `eva-cache-${repoId}`;
}

/**
 * Environment that points the three package managers at {@link DRIVE_CACHE_ROOT}.
 *
 * `npm_config_*` (lower-case) is the form npm itself exports to lifecycle
 * scripts, and both npm and pnpm read it, so it survives nested invocations
 * that a CLI flag would not. pnpm's store is `store-dir`; npm has no store and
 * ignores the key.
 */
export const DRIVE_CACHE_ENV: Record<string, string> = {
  npm_config_cache: `${DRIVE_CACHE_ROOT}/npm`,
  npm_config_store_dir: `${DRIVE_CACHE_ROOT}/pnpm-store`,
  YARN_CACHE_FOLDER: `${DRIVE_CACHE_ROOT}/yarn`,
};

/**
 * Shell that makes {@link DRIVE_CACHE_ROOT} exist and be writable, whatever
 * happened at mount time. Idempotent, and cannot fail: every branch ends in a
 * usable directory and the script exits 0.
 *
 * Deliberately takes no role argument and PROBES the mount instead. A sandbox
 * that asked for `read-write` may still have been given a read-only snapshot —
 * the provider demotes rather than failing the create when another sandbox
 * holds the Drive's write lock. Bind-mounting a read-only Drive as if it were
 * writable would then break every install, which is strictly worse than the
 * cold cache this is supposed to degrade to. The filesystem knows the truth.
 *
 * Bind rather than symlink for the writable case: pnpm resolves the store path
 * before deciding whether it can hard-link into `node_modules`, and a symlinked
 * store made that decision inconsistent between invocations.
 */
export function driveCacheSetupScript(): string {
  const probe = `${DRIVE_MOUNT_PATH}/.eva-write-probe`;
  return [
    `sudo mkdir -p ${DRIVE_CACHE_ROOT} 2>/dev/null || true`,
    // Already set up (resumed sandbox, or this ran earlier in create) — stop.
    `if mountpoint -q ${DRIVE_CACHE_ROOT} 2>/dev/null; then exit 0; fi`,
    // No Drive attached is not an early exit: the directory layout below still
    // has to be built, it is just backed by local disk and starts empty.
    `if [ -d ${DRIVE_MOUNT_PATH} ]; then`,
    `  if sudo touch ${probe} 2>/dev/null; then`,
    `    sudo rm -f ${probe} 2>/dev/null || true`,
    `    sudo mount --bind ${DRIVE_MOUNT_PATH} ${DRIVE_CACHE_ROOT} 2>/dev/null || true`,
    `  else`,
    // Read-only snapshot mount. Overlay a local upper dir so package managers
    // can write (they do so even on a cache hit); reads still fall through to
    // the Drive. Writes are discarded with the sandbox.
    `    sudo mkdir -p ${OVERLAY_UPPER} ${OVERLAY_WORK} 2>/dev/null || true`,
    `    sudo mount -t overlay overlay -o lowerdir=${DRIVE_MOUNT_PATH},upperdir=${OVERLAY_UPPER},workdir=${OVERLAY_WORK} ${DRIVE_CACHE_ROOT} 2>/dev/null || true`,
    `  fi`,
    `fi`,
    // World-writable so the `eva` user and root share one cache; the mount may
    // be owned by root. Deliberately NOT recursive — on a warm Drive that would
    // walk the entire package store on every single sandbox create.
    `sudo mkdir -p ${DRIVE_CACHE_ENV.npm_config_cache} ${DRIVE_CACHE_ENV.npm_config_store_dir} ${DRIVE_CACHE_ENV.YARN_CACHE_FOLDER} 2>/dev/null || true`,
    `sudo chmod 777 ${DRIVE_CACHE_ROOT} ${DRIVE_CACHE_ENV.npm_config_cache} ${DRIVE_CACHE_ENV.npm_config_store_dir} ${DRIVE_CACHE_ENV.YARN_CACHE_FOLDER} 2>/dev/null || true`,
    `exit 0`,
  ].join("\n");
}
