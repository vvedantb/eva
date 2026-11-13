import type { SandboxRegion } from "@vercel/sandbox";

/**
 * Region for both sandboxes and Drives. Drives are region-pinned and a sandbox
 * can only mount one created in its own region, so the two must be set from a
 * single value.
 *
 * iad1 (Washington, D.C.): Active CPU, memory and Drive rates there are about
 * 30% under cdg1 (Paris) and lhr1 (London), checked 2026-11-13. Sandboxes ran
 * in cdg1 from 2026-10-07 (#899) to 2026-11-13.
 */
export const SANDBOX_REGION: SandboxRegion = "iad1";
/**
 * Regions a sandbox may land in when {@link SANDBOX_REGION} has no capacity.
 * cle1 (Cleveland) is the nearest other Sandbox region. Drives are
 * region-pinned, so a failed-over sandbox cannot mount the iad1 Drive; if that
 * fails the create, the mount fallback ladder retries without it.
 */
export const SANDBOX_FAILOVER_REGIONS: SandboxRegion[] = ["cle1"];

/**
 * Where a create runs. A snapshot only restores in a region it lives in, and
 * snapshots taken while sandboxes ran in cdg1 live there only — so a snapshot
 * create follows its snapshot until the repo is seeded again. `undefined` (no
 * snapshot, or the lookup failed) keeps the default and lets the create report the real
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
