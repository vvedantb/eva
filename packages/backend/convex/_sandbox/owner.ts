import { v, type Infer } from "convex/values";
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { SANDBOX_STARTUP_PREFIX, sandboxOwnerKey } from "@eva/shared";
import { hasRepoAccess } from "../functions";

/**
 * One sandbox owner contract shared by view state, PTYs, panes, and runtime
 * APIs. Every sandbox belongs to a session (a quick task's or project's
 * sandbox is its owned session's).
 */
export const sandboxOwnerValidator = v.object({
  kind: v.literal("session"),
  sessionId: v.id("sessions"),
});

export type SandboxOwner = Infer<typeof sandboxOwnerValidator>;

export type ResolvedSandboxOwner = {
  kind: "session";
  ownerKey: string;
  doc: Doc<"sessions">;
};

/** Inverse of `sandboxStartupEntityId`: null when `entityId` is not a startup row. */
export function parseSandboxStartupEntityId(
  db: Pick<GenericDatabaseReader<DataModel>, "normalizeId">,
  entityId: string,
): SandboxOwner | null {
  const after = (prefix: string) =>
    entityId.startsWith(prefix) ? entityId.slice(prefix.length) : null;
  const session = after(SANDBOX_STARTUP_PREFIX.session);
  if (session !== null) {
    const sessionId = db.normalizeId("sessions", session);
    return sessionId ? { kind: "session", sessionId } : null;
  }
  return null;
}

/**
 * Reverse lookup: which session owns `sandboxId`. Unauthenticated by design:
 * callers are internal (sweeps, HTTP heartbeats).
 */
export async function findSandboxOwnerBySandboxId(
  db: GenericDatabaseReader<DataModel>,
  sandboxId: string,
): Promise<ResolvedSandboxOwner | null> {
  const session = await db
    .query("sessions")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (session) {
    return {
      kind: "session",
      ownerKey: sandboxOwnerKey({ kind: "session", sessionId: session._id }),
      doc: session,
    };
  }

  return null;
}

/** Resolves and authorizes any sandbox owner without duplicating table policy. */
export async function resolveSandboxOwnerForUser(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  owner: SandboxOwner,
): Promise<ResolvedSandboxOwner | null> {
  const session = await db.get(owner.sessionId);
  if (!session || !(await hasRepoAccess(db, session.repoId, userId))) {
    return null;
  }
  return {
    kind: "session",
    ownerKey: sandboxOwnerKey(owner),
    doc: session,
  };
}

/** Like `resolveSandboxOwnerForUser`, but a missing or forbidden owner throws. */
export async function resolveSandboxOwnerOrThrow(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  owner: SandboxOwner,
): Promise<ResolvedSandboxOwner> {
  const resolved = await resolveSandboxOwnerForUser(db, userId, owner);
  if (!resolved) throw new Error("Sandbox owner not found");
  return resolved;
}

type SandboxOwnerPatch = Partial<
  Pick<
    Doc<"sessions">,
    | "terminalPanes"
    | "previewPath"
    | "previewPanePaths"
    | "devPort"
    | "terminalHistoryTail"
    | "agentBrowsingAt"
    | "updatedAt"
  >
>;

/** Patches the owner session's sandbox view fields. */
export async function patchSandboxOwner(
  db: GenericDatabaseWriter<DataModel>,
  owner: ResolvedSandboxOwner,
  fields: SandboxOwnerPatch,
): Promise<void> {
  await db.patch(owner.doc._id, fields);
}
