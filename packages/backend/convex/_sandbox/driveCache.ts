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

/** Where Vercel attaches the shared toolchain Drive. See TOOLCHAIN_SHARES. */
export const TOOLCHAIN_MOUNT_PATH = "/eva-toolchain";

/**
 * One Drive for the whole Vercel project, holding toolchain artefacts that are
 * byte-identical for every repo — unlike the per-repo package cache, there is
 * nothing repo-specific about a Convex backend build or a cursor-agent release.
 */
export const TOOLCHAIN_DRIVE_NAME = "eva-toolchain";

/** One directory redirected onto the toolchain Drive. */
interface ToolchainShare {
  /** Normal on-disk location; the Drive copy is mounted over it. */
  localPath: string;
  /** Directory name on the toolchain Drive. */
  driveDir: string;
  /**
   * Whether the local copy may be deleted before a snapshot once the Drive
   * holds it. Only true for a pure download cache the tool refills on demand.
   * An installed program must say false: if a later sandbox's Drive fails to
   * attach, the local copy is the only one, and deleting it breaks the tool
   * rather than making it re-download.
   */
  pruneLocalWhenOnDrive: boolean;
}

/**
 * Directories redirected onto the toolchain Drive. Each is mounted over its
 * normal location, so the tools need no configuration and keep working if the
 * Drive is absent.
 *
 * - Convex local backend: a download cache. The CLI fetches a missing build on
 *   demand, so the local copy is pruned once the Drive holds it.
 * - cursor-agent: the INSTALLED program. `~/.local/bin/cursor-agent` is a
 *   symlink into `versions/<v>/cursor-agent` (checked on a seeded sandbox,
 *   2026-10-06), so the local copy must stay or the command breaks whenever
 *   the Drive is missing. It still gains from the Drive for upgrades, but it
 *   saves no snapshot space.
 *
 * Chrome (~416 MB in /opt/google) is deliberately NOT here despite being the
 * single largest candidate: it is installed by `dnf` and owned by the RPM
 * database, so bind-mounting over its directory would leave rpm describing
 * files that are no longer visible — a broken package manager is not worth
 * 400 MB. Anything added here must be plain downloaded files that no package
 * manager tracks.
 */
export const TOOLCHAIN_SHARES: ReadonlyArray<ToolchainShare> = [
  {
    localPath: "/home/vercel-sandbox/.cache/convex/binaries",
    driveDir: "convex-binaries",
    pruneLocalWhenOnDrive: true,
  },
  {
    localPath: "/home/eva/.local/share/cursor-agent/versions",
    driveDir: "cursor-agent",
    pruneLocalWhenOnDrive: false,
  },
];

/**
 * Shell that redirects {@link TOOLCHAIN_SHARES} onto the toolchain Drive.
 *
 * Same three-way degradation as {@link driveCacheSetupScript}, and the same
 * writability probe rather than a trusted role. One extra rule: a share is only
 * redirected if the Drive actually has content for it OR the Drive is writable.
 * Bind-mounting an empty read-only directory over a populated local cache would
 * HIDE a working toolchain and force a re-download — worse than doing nothing.
 */
export function toolchainSetupScript(): string {
  const probe = `${TOOLCHAIN_MOUNT_PATH}/.eva-write-probe`;
  return [
    `if [ ! -d ${TOOLCHAIN_MOUNT_PATH} ]; then exit 0; fi`,
    `TC_RW=0`,
    `if sudo touch ${probe} 2>/dev/null; then sudo rm -f ${probe} 2>/dev/null || true; TC_RW=1; fi`,
    ...TOOLCHAIN_SHARES.flatMap(({ localPath, driveDir }) => {
      const src = `${TOOLCHAIN_MOUNT_PATH}/${driveDir}`;
      return [
        `if mountpoint -q ${localPath} 2>/dev/null; then :;`,
        // Writable Drive: seed it from whatever is already on local disk, then
        // take it over. `cp -an` never clobbers a newer copy on the Drive.
        `elif [ "$TC_RW" = "1" ]; then`,
        `  sudo mkdir -p ${src} ${localPath} 2>/dev/null || true`,
        `  sudo cp -an ${localPath}/. ${src}/ 2>/dev/null || true`,
        `  sudo mount --bind ${src} ${localPath} 2>/dev/null || true`,
        `  sudo chmod 777 ${localPath} 2>/dev/null || true`,
        // Read-only Drive: only take over when the Drive has something to
        // give, and overlay rather than bind — these tools write a new version
        // directory into their own cache, and a read-only bind would turn that
        // into a hard failure instead of a re-download.
        `elif [ -d ${src} ] && [ -n "$(ls -A ${src} 2>/dev/null)" ]; then`,
        `  sudo mkdir -p ${localPath} ${OVERLAY_UPPER}/${driveDir} ${OVERLAY_WORK}/${driveDir} 2>/dev/null || true`,
        `  sudo mount -t overlay overlay -o lowerdir=${src},upperdir=${OVERLAY_UPPER}/${driveDir},workdir=${OVERLAY_WORK}/${driveDir} ${localPath} 2>/dev/null || true`,
        `  sudo chmod 777 ${localPath} 2>/dev/null || true`,
        `fi`,
      ];
    }),
    `exit 0`,
  ].join("\n");
}

/** Releases the {@link TOOLCHAIN_SHARES} bind mounts before a snapshot capture. */
function toolchainTeardownLines(): string[] {
  return TOOLCHAIN_SHARES.map(
    ({ localPath }) => `sudo umount -l ${localPath} 2>/dev/null || true`,
  );
}

/**
 * Local cache directories made redundant by the Drives, per home directory.
 * Every sandbox created with this code points package managers at
 * {@link DRIVE_CACHE_ROOT} (see DRIVE_CACHE_ENV), so these defaults are never
 * written again — but a seeded snapshot built before the switch still carries
 * them (2.2 GB pnpm store + 1.4 GB npm cache + 187 MB pnpm metadata on the
 * sandbox measured 2026-09-23). Pure caches: deleting them never breaks an
 * existing `node_modules`, because pnpm and npm copy, hard-link or reflink
 * files out of the cache and the installed copy keeps its own data.
 */
const LOCAL_CACHES_REPLACED_BY_DRIVE: ReadonlyArray<string> = [
  ".local/share/pnpm/store",
  ".cache/pnpm",
  ".npm/_cacache",
];

/**
 * Snapshot-time deletion of every local copy the Drives have made redundant.
 * Runs AFTER {@link driveCacheTeardownScript}: the mounts must be down first,
 * or `rm` would empty the Drive itself instead of the local disk under it.
 *
 * Toolchain shares are only pruned when marked safe AND when every local
 * version is confirmed present on the Drive, so a failed Drive seed can never
 * leave a snapshot with no copy at all. The Drive itself stays mounted at
 * {@link TOOLCHAIN_MOUNT_PATH} during capture, which is what lets that check
 * see it.
 */
export function driveRedundantLocalPruneLines(
  homes: ReadonlyArray<string>,
): string[] {
  return [
    ...homes.flatMap((home) =>
      LOCAL_CACHES_REPLACED_BY_DRIVE.map(
        (dir) => `sudo rm -rf ${home}/${dir} 2>/dev/null || true`,
      ),
    ),
    ...TOOLCHAIN_SHARES.filter((share) => share.pruneLocalWhenOnDrive).map(
      ({ localPath, driveDir }) => {
        const src = `${TOOLCHAIN_MOUNT_PATH}/${driveDir}`;
        // One version directory at a time, and only when the Drive has that
        // exact version — never a blanket `rm` of the parent.
        return `if [ -d ${src} ] && [ -d ${localPath} ] && ! mountpoint -q ${localPath} 2>/dev/null; then for v in ${localPath}/*/; do n=$(basename "$v"); [ -d "${src}/$n" ] && sudo rm -rf "$v" 2>/dev/null || true; done; fi`;
      },
    ),
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
    // Toolchain binds first-class here rather than as a separate script: both
    // must come down before the same capture, and two scripts joined by the
    // caller would put an `exit 0` between them and silently skip the second.
    ...toolchainTeardownLines(),
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
 * Cannot collide with {@link TOOLCHAIN_DRIVE_NAME}: Convex ids are 32-char
 * base32 strings, never the word "toolchain".
 */
export function driveCacheName(repoId: string): string {
  return `eva-${repoId}`;
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
  // pnpm's registry-metadata cache is a SEPARATE key from the store: the store
  // holds package contents, `cache-dir` holds the resolution metadata (167 MB
  // of it on a seeded sandbox). Without this it stays on local disk and gets
  // baked into every snapshot.
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
    // Derived from DRIVE_CACHE_ENV, never hand-listed: adding a cache above
    // must not require remembering to create and chmod its directory here.
    `sudo mkdir -p ${cacheDirs} 2>/dev/null || true`,
    `sudo chmod 777 ${DRIVE_CACHE_ROOT} ${cacheDirs} 2>/dev/null || true`,
    `exit 0`,
  ].join("\n");
}
