import { beforeEach, describe, expect, test, vi } from "vitest";
import { SANDBOX_REGION } from "../convex/_sandbox/vercelRegion";

/**
 * Forking a session whose sandbox predates the move to cdg1 failed: "The
 * snapshot is available in `iad1`, but this sandbox runs in `cdg1`" (#995).
 * `create` skipped the region lookup for forks, so a fork always went to
 * SANDBOX_REGION. A fork restores from the source's current snapshot and must
 * follow that snapshot's region.
 */

interface ForkOpts {
  region?: string;
  mounts?: object;
}

const sdk = vi.hoisted(() => {
  const state: {
    sourceSnapshotId: string | undefined;
    sourceLookupFails: boolean;
    snapshotRegions: Map<string, string[]>;
    forkOpts: ForkOpts[];
  } = {
    sourceSnapshotId: undefined,
    sourceLookupFails: false,
    snapshotRegions: new Map(),
    forkOpts: [],
  };
  return state;
});

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: async () => {
      if (sdk.sourceLookupFails) throw new Error("404");
      return { currentSnapshotId: sdk.sourceSnapshotId };
    },
    fork: async (opts: ForkOpts) => {
      sdk.forkOpts.push(opts);
      // Stop here: the test only needs the placement fork was called with.
      throw new Error("fork stubbed");
    },
  },
  Snapshot: {
    get: async ({ snapshotId }: { snapshotId: string }) => ({
      regions: sdk.snapshotRegions.get(snapshotId) ?? [],
    }),
  },
  Drive: class Drive {
    static async getOrCreate() {
      return new Drive();
    }
    snapshot() {
      return {};
    }
  },
}));

const { createVercelClient } = await import(
  "../convex/_sandbox/vercelProvider"
);

const forkOnce = async () => {
  const client = createVercelClient({ token: "t", teamId: "team", projectId: "prj" });
  await expect(
    client.create({
      forkFrom: "source-sbx",
      envVars: {},
      lifecycle: { autoStopMinutes: 30 },
      mounts: [{ volumeName: "cache", path: "/cache", mode: "read-write" }],
    }),
  ).rejects.toThrow(/fork stubbed/);
  return sdk.forkOpts[0];
};

beforeEach(() => {
  sdk.sourceSnapshotId = undefined;
  sdk.sourceLookupFails = false;
  sdk.snapshotRegions.clear();
  sdk.forkOpts.length = 0;
});

describe("VercelSandboxClient.create with forkFrom", () => {
  test("a fork of an old iad1 sandbox runs in iad1, without cdg1 Drives", async () => {
    sdk.sourceSnapshotId = "snap-old";
    sdk.snapshotRegions.set("snap-old", ["iad1"]);
    const opts = await forkOnce();
    expect(opts?.region).toBe("iad1");
    expect(opts?.mounts).toBeUndefined();
  });

  test("a fork of a current sandbox stays in the default region, with Drives", async () => {
    sdk.sourceSnapshotId = "snap-new";
    sdk.snapshotRegions.set("snap-new", [SANDBOX_REGION]);
    const opts = await forkOnce();
    expect(opts?.region).toBe(SANDBOX_REGION);
    expect(opts?.mounts).toHaveProperty("/cache");
  });

  test("a failed source lookup falls back to the default region", async () => {
    sdk.sourceLookupFails = true;
    expect((await forkOnce())?.region).toBe(SANDBOX_REGION);
  });
});
