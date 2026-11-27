import { describe, expect, test } from "bun:test";
import {
  SANDBOX_FAILOVER_REGIONS,
  SANDBOX_REGION,
  sandboxPlacement,
} from "../convex/_sandbox/vercelRegion";

const OLD_REGION = "cdg1";

describe("sandboxPlacement", () => {
  test("no snapshot to follow keeps the default region, failover and Drives", () => {
    expect(sandboxPlacement(undefined)).toEqual({
      region: SANDBOX_REGION,
      failoverRegions: SANDBOX_FAILOVER_REGIONS,
      mountDrives: true,
    });
  });

  test("a snapshot in the default region stays there", () => {
    expect(sandboxPlacement([OLD_REGION, SANDBOX_REGION]).region).toBe(
      SANDBOX_REGION,
    );
  });

  test("an old snapshot outside the default region restores where it lives", () => {
    const placement = sandboxPlacement([OLD_REGION]);
    expect(placement.region).toBe(OLD_REGION);
    expect(placement.mountDrives).toBe(false);
    expect(placement.failoverRegions).not.toContain(OLD_REGION);
  });

  test("an empty region list falls back to the default", () => {
    expect(sandboxPlacement([]).region).toBe(SANDBOX_REGION);
  });
});
