import { describe, expect, test } from "vitest";
import {
  SANDBOX_FAILOVER_REGIONS,
  SANDBOX_REGION,
  sandboxPlacement,
} from "../convex/_sandbox/vercelRegion";

/**
 * After #899 moved sandboxes to cdg1, restoring a seed snapshot taken earlier
 * failed: "The snapshot is available in `iad1`, but this sandbox runs in
 * `cdg1`" (fix #900). A create from a snapshot must follow the snapshot, and a
 * sandbox outside SANDBOX_REGION cannot mount its region-pinned Drives.
 */
describe("sandboxPlacement", () => {
  test("no snapshot to follow keeps the default region, failover and Drives", () => {
    expect(sandboxPlacement(undefined)).toEqual({
      region: SANDBOX_REGION,
      failoverRegions: SANDBOX_FAILOVER_REGIONS,
      mountDrives: true,
    });
  });

  test("a snapshot in the default region stays there", () => {
    expect(sandboxPlacement(["iad1", SANDBOX_REGION]).region).toBe(
      SANDBOX_REGION,
    );
  });

  test("an old snapshot outside the default region restores where it lives", () => {
    const placement = sandboxPlacement(["iad1"]);
    expect(placement.region).toBe("iad1");
    // Drives live in SANDBOX_REGION only; mounting them would fail the create.
    expect(placement.mountDrives).toBe(false);
    // Never list the chosen region as its own failover.
    expect(placement.failoverRegions).not.toContain("iad1");
  });

  test("an empty region list falls back to the default", () => {
    expect(sandboxPlacement([]).region).toBe(SANDBOX_REGION);
  });
});
