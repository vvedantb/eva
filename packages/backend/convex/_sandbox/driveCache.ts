import { SANDBOX_REGION } from "./vercelRegion";

/** Where Vercel attaches the Drive. Never referenced by build tooling directly. */
export const DRIVE_MOUNT_PATH = "/eva-drive";

/**
 * The cache root every package manager is pointed at. Always exists and is
 * always writable: it is the Drive itself (writer), an overlay over the Drive
 * (reader), or a plain empty directory (no Drive). Keeping it stable is what
 * lets the env file below be identical in all three cases.
 */
export const DRIVE_CACHE_ROOT = "/eva-cache";

const LOCAL_CACHES_REPLACED_BY_DRIVE: ReadonlyArray<string> = [
  ".local/share/pnpm/store",
  ".cache/pnpm",
  ".npm/_cacache",
];

/** Home directories that may hold tool caches. Both users exist on the image. */
export const SANDBOX_HOME_DIRS: ReadonlyArray<string> = [
  "/home/vercel-sandbox",
  "/home/eva",
  "/root",
];

/**
 * Deletes package caches that live on the sandbox's local disk. Pure caches:
 * an existing `node_modules` keeps its own copy (see
 * {@link LOCAL_CACHES_REPLACED_BY_DRIVE}), so the only cost is a cold install.
 *
 * Covers the old per-home caches and {@link DRIVE_CACHE_ROOT} itself when it is
 * a plain local directory. That second case is every sandbox whose Drive did
 * not mount (2026-10-07 to 2026-11-12, every Drive was in the wrong region),
 * and it was baked into seeded snapshots: 5.2 GB measured 2026-11-11. A
 * mounted cache root (Drive bind or reader overlay) is never touched, so this
 * can never empty the Drive.
 */
export function localCachePruneLines(): string[] {
  return [
    `for h in ${SANDBOX_HOME_DIRS.join(" ")}; do for d in ${LOCAL_CACHES_REPLACED_BY_DRIVE.join(" ")}; do sudo rm -rf "$h/$d" 2>/dev/null || true; done; done`,
    `if ! mountpoint -q ${DRIVE_CACHE_ROOT} 2>/dev/null; then`,
    `  sudo find ${DRIVE_CACHE_ROOT} -mindepth 2 -maxdepth 2 ! -path ${DRIVE_CACHE_ROOT}/npm/_npx -exec rm -rf {} + 2>/dev/null || true`,
    `fi`,
  ];
}

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
 *
 * The region is part of the name because a Drive is pinned to the region it
 * was created in, and a name can exist in one region only. The first Drives
 * were created in iad1 (2026-10-06); sandboxes moved to cdg1 the next day, and
 * from then on every `getOrCreate` failed with "409 already exists in a
 * different region", so no sandbox mounted its Drive. With the region in
 * the name, each region has its own Drive, and a move of
 * {@link SANDBOX_REGION} creates a new Drive instead of failing.
 */
export function driveCacheName(repoId: string): string {
  return `eva-${SANDBOX_REGION}-${repoId}`;
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
  npm_config_cache_dir: `${DRIVE_CACHE_ROOT}/pnpm-metadata`,
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
  const cacheDirs = Object.values(DRIVE_CACHE_ENV).join(" ");
  return [
    `sudo mkdir -p ${DRIVE_CACHE_ROOT} 2>/dev/null || true`,
    `if mountpoint -q ${DRIVE_CACHE_ROOT} 2>/dev/null; then exit 0; fi`,
    `if [ -d ${DRIVE_MOUNT_PATH} ]; then`,
    `  if sudo touch ${probe} 2>/dev/null; then`,
    `    sudo rm -f ${probe} 2>/dev/null || true`,
    `    sudo mount --bind ${DRIVE_MOUNT_PATH} ${DRIVE_CACHE_ROOT} 2>/dev/null || true`,
    `  else`,
    `    sudo mkdir -p ${OVERLAY_UPPER} ${OVERLAY_WORK} 2>/dev/null || true`,
    `    sudo mount -t overlay overlay -o lowerdir=${DRIVE_MOUNT_PATH},upperdir=${OVERLAY_UPPER},workdir=${OVERLAY_WORK} ${DRIVE_CACHE_ROOT} 2>/dev/null || true`,
    `  fi`,
    `fi`,
    `sudo mkdir -p ${cacheDirs} 2>/dev/null || true`,
    `sudo chmod 777 ${DRIVE_CACHE_ROOT} ${cacheDirs} 2>/dev/null || true`,
    `exit 0`,
  ].join("\n");
}
