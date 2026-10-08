import { describe, expect, it } from "vitest";
import {
  SANDBOX_STATUS_STYLES,
  sandboxDisplayStatus,
  type SandboxStatus,
} from "./sandboxStatusStyles";

describe("sandboxDisplayStatus", () => {
  it("reports error only when a closed session carries a failure", () => {
    expect(
      sandboxDisplayStatus({ status: "closed", sandboxError: "No capacity" }),
    ).toBe("error");
    expect(sandboxDisplayStatus({ status: "closed" })).toBe("closed");
    expect(sandboxDisplayStatus({ status: "closed", sandboxError: "" })).toBe(
      "closed",
    );
  });

  it("never overrides a live status with a stale failure", () => {
    const live: SandboxStatus[] = ["active", "starting", "stopping"];
    for (const status of live) {
      expect(sandboxDisplayStatus({ status, sandboxError: "No capacity" })).toBe(
        status,
      );
    }
  });

  it("gives every display status a dot and a wake/sleep label", () => {
    expect(SANDBOX_STATUS_STYLES.active.label).toBe("Awake");
    expect(SANDBOX_STATUS_STYLES.starting.label).toBe("Waking up");
    expect(SANDBOX_STATUS_STYLES.stopping.label).toBe("Going to sleep");
    expect(SANDBOX_STATUS_STYLES.closed.label).toBe("Asleep");
    expect(SANDBOX_STATUS_STYLES.error.label).toBe("Couldn't wake up");
    expect(SANDBOX_STATUS_STYLES.error.dot).toBe("bg-destructive");
  });
});
