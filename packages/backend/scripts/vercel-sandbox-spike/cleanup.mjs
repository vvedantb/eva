// @ts-check
/**
 * SAFE cleanup for the migration tooling. This runs against the REAL eva /
 * Evalucom Vercel project, so it must NEVER touch resources it did not create:
 *
 *  - Sandboxes: deletes ONLY those tagged `managedBy: "eva-migration-tooling"`
 *    (set by managed-image-spike.mjs). Untagged sandboxes are left alone.
 *  - Snapshots: NOT deleted by default (they have no tags in the API, so they
 *    can't be safely filtered, and the seeded snapshot is usually the deliverable).
 *    Pass explicit ids via CLEANUP_SNAPSHOT_IDS="snap_a,snap_b" to delete specific ones.
 *
 * Usage:
 *   node cleanup.mjs                      # delete only tooling-tagged sandboxes
 *   CLEANUP_SNAPSHOT_IDS=snap_x node cleanup.mjs   # + delete those specific snapshots
 */
import { Sandbox, Snapshot } from "@vercel/sandbox";

const CREDS = {
  token: process.env.VERCEL_TOKEN,
  teamId: process.env.VERCEL_TEAM_ID,
  projectId: process.env.VERCEL_PROJECT_ID,
};
const MANAGED_VALUE = "eva-migration-tooling";
const snapshotIds = (process.env.CLEANUP_SNAPSHOT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let deleted = 0;
let skipped = 0;

const list = await Sandbox.list(CREDS);
for await (const s of list) {
  const managed = s.tags?.managedBy === MANAGED_VALUE;
  if (!managed) {
    skipped++;
    console.log(`SKIP (not tooling-tagged): ${s.name}`);
    continue;
  }
  try {
    const sbx = await Sandbox.get({ ...CREDS, name: s.name, resume: false });
    await sbx.delete();
    deleted++;
    console.log(`deleted sandbox ${s.name}`);
  } catch (e) {
    console.log(`skip sandbox ${s.name}: ${String(e).split("\n")[0]}`);
  }
}

let snapDeleted = 0;
for (const id of snapshotIds) {
  try {
    const snap = await Snapshot.get({ ...CREDS, snapshotId: id });
    await snap.delete();
    snapDeleted++;
    console.log(`deleted snapshot ${id}`);
  } catch (e) {
    console.log(`skip snapshot ${id}: ${String(e).split("\n")[0]}`);
  }
}

console.log(
  `\nDone. Deleted ${deleted} tagged sandboxes (skipped ${skipped} untagged), ${snapDeleted} snapshots (of ${snapshotIds.length} requested).`,
);
if (!snapshotIds.length) {
  console.log("Snapshots left untouched — pass CLEANUP_SNAPSHOT_IDS=... to delete specific ones.");
}
