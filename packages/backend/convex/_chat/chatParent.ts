import { v } from "convex/values";
import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** The chat surface a sandbox MCP token names. */
export const chatEntityKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

type ChatEntityKind = typeof chatEntityKindValidator.type;

/** The chat a sandbox token names, resolved to the id its messages hang off. */
export function resolveChatParent(
  db: DatabaseReader,
  entityKind: ChatEntityKind,
  entityId: string,
): Id<"sessions"> | Id<"agentTasks"> | Id<"projects"> | null {
  if (entityKind === "session") return db.normalizeId("sessions", entityId);
  if (entityKind === "task") return db.normalizeId("agentTasks", entityId);
  return db.normalizeId("projects", entityId);
}
