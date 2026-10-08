import type { SandboxRegion } from "@vercel/sandbox";

/**
 * Region for both sandboxes and Drives. Drives are region-pinned and a sandbox
 * can only mount one created in its own region, so the two must be set from a
 * single value.
 */
export const SANDBOX_REGION: SandboxRegion = "cdg1";
/**
 * Regions a sandbox may land in when {@link SANDBOX_REGION} has no capacity.
 * Drives are region-pinned, so a failed-over sandbox cannot mount the cdg1
 * Drive; if that fails the create, the mount fallback ladder retries without it.
 */
export const SANDBOX_FAILOVER_REGIONS: SandboxRegion[] = ["iad1"];

/**
 * Where a create runs. A snapshot only restores in a region it lives in, and
 * seed snapshots taken before the move to {@link SANDBOX_REGION} live in iad1
 * only — so a snapshot create follows its snapshot. `undefined` (no snapshot,
 * or the lookup failed) keeps the default and lets the create report the real
 * error. Drives stay pinned to {@link SANDBOX_REGION}, so any other region
 * skips them rather than spend a failed create.
 */
export function sandboxPlacement(
  snapshotRegions: ReadonlyArray<SandboxRegion> | undefined,
): {
  region: SandboxRegion;
  failoverRegions: SandboxRegion[];
  mountDrives: boolean;
} {
  const region =
    snapshotRegions === undefined || snapshotRegions.includes(SANDBOX_REGION)
      ? SANDBOX_REGION
      : (snapshotRegions[0] ?? SANDBOX_REGION);
  return {
    region,
    failoverRegions: SANDBOX_FAILOVER_REGIONS.filter((r) => r !== region),
    mountDrives: region === SANDBOX_REGION,
  };
}
