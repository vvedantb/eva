import type { GenericDatabaseWriter } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type DatabaseWriter = GenericDatabaseWriter<DataModel>;

const STARTUP_ACTIVITY = JSON.stringify([
  { type: "tool", label: "Starting sandbox...", status: "active" },
]);

/**
 * Seeds a "Starting sandbox..." streaming step for an entity so the UI shows a
 * real step instead of the random "Eva is inferring…" spinner while the start
 * action / workflow schedules. Patches the existing row or inserts a new one.
 */
export async function seedSandboxStartupActivity(
  db: DatabaseWriter,
  entityId: string,
): Promise<void> {
  const existing = await db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (existing) {
    await db.patch(existing._id, {
      currentActivity: STARTUP_ACTIVITY,
      currentContent: "",
      lastUpdatedAt: Date.now(),
    });
  } else {
    await db.insert("streamingActivity", {
      entityId,
      currentActivity: STARTUP_ACTIVITY,
      currentContent: "",
      lastUpdatedAt: Date.now(),
    });
  }
}

/**
 * Clears any leftover startup streaming step for an entity so a stop does not
 * re-show "Starting sandbox..." / cold-storage copy while status is stopping.
 */
export async function clearSandboxStartupActivity(
  db: DatabaseWriter,
  entityId: string,
): Promise<void> {
  const existing = await db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (existing) await db.delete(existing._id);
}
