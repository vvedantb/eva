/** Persistent auto-snapshots: never expire — lifecycle owned by delete paths. */
export const SNAPSHOT_TTL_MS = 0;

/**
 * Safety-net TTL if an ephemeral sandbox ever produces a snap_* (should not —
 * persistent:false skips auto-snapshot). Vercel rejects values between 0 and
 * 1 day (`snapshotExpiration` must be 0 or >= 86400000); use the minimum
 * non-zero TTL so leaked storage still expires instead of inheriting forever.
 */
export const EPHEMERAL_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/** Delay after entity death before deleting its sandbox (+ snapshots). */
export const SANDBOX_DELETE_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * Cap auto-snapshots (on stop) and explicit `snapshot()` calls to one per
 * sandbox lineage, deleting older ones immediately. Without this, persistent
 * sandboxes accumulate snap_* objects on every stop/resume cycle.
 * `expiration: 0` matches never-expire persistent policy.
 * @see https://vercel.com/docs/sandbox/sdk-reference#keeplastsnapshots
 */
export const KEEP_LAST_SNAPSHOTS = {
  count: 1,
  deleteEvicted: true,
  expiration: SNAPSHOT_TTL_MS,
} as const;

/**
 * Create-time snapshot billing knobs for Vercel sandboxes.
 * Persistent: never-expire + keep-last-1. Ephemeral: 1-day safety TTL only.
 */
export function vercelSnapshotCreateOptions(persistent: boolean): {
  snapshotExpiration: number;
  keepLastSnapshots?: typeof KEEP_LAST_SNAPSHOTS;
} {
  if (persistent) {
    return {
      snapshotExpiration: SNAPSHOT_TTL_MS,
      keepLastSnapshots: KEEP_LAST_SNAPSHOTS,
    };
  }
  return { snapshotExpiration: EPHEMERAL_SNAPSHOT_TTL_MS };
}
