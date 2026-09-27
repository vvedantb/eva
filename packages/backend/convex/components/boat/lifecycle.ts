import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import {
  boat,
  BoatApiError,
  errorMessage,
  sandboxPath,
  sandboxResponse,
  TRANSITIONAL,
  type BoatSandbox,
} from "./api";
import { publicRecord, sandboxRecord, toPublic } from "./sandboxes";

// Explicit types below break the cycle: this module's functions are part of `internal`'s type.
type SandboxRecord = typeof sandboxRecord.type;
type PublicRecord = typeof publicRecord.type;
type Linked = SandboxRecord & { sandboxId: string };

const machineType = v.optional(
  v.union(v.literal("small"), v.literal("default"), v.literal("large")),
);
const ttlSeconds = v.optional(v.union(v.number(), v.null()));
const envVars = v.optional(v.record(v.string(), v.string()));

const createOptions = v.object({
  name: v.optional(v.string()),
  type: machineType,
  ttlSeconds,
  env: envVars,
  environment: v.optional(v.string()),
  noEnv: v.optional(v.boolean()),
  setupScript: v.optional(v.string()),
  from: v.optional(v.string()),
});

const resumeOptions = v.object({
  type: machineType,
  ttlSeconds,
  env: envVars,
  environment: v.optional(v.string()),
  noEnv: v.optional(v.boolean()),
});

const identity = { ownerId: v.string(), key: v.string() };

/** The linked record for (ownerId, key), or a clear error. */
export async function requireLinked(
  ctx: ActionCtx,
  ownerId: string,
  key: string,
): Promise<Linked> {
  const record: SandboxRecord | null = await ctx.runQuery(
    internal.sandboxes.find,
    { ownerId, key },
  );
  if (!record) throw new Error(`No Boat sandbox for key ${JSON.stringify(key)}`);
  const { sandboxId } = record;
  if (!sandboxId) {
    throw new Error(`Boat sandbox ${JSON.stringify(key)} is still being created`);
  }
  return { ...record, sandboxId };
}

async function sync(
  ctx: ActionCtx,
  record: SandboxRecord,
  sandbox: BoatSandbox,
): Promise<PublicRecord> {
  const synced: SandboxRecord | null = await ctx.runMutation(
    internal.sandboxes.sync,
    { id: record._id, sandbox },
  );
  if (!synced) {
    throw new Error(
      `Boat sandbox ${JSON.stringify(record.key)} was deleted meanwhile`,
    );
  }
  if (TRANSITIONAL.has(synced.state)) {
    await ctx.scheduler.runAfter(2_000, internal.lifecycle.settle, {
      id: record._id,
      attempt: 0,
    });
  }
  return toPublic(synced);
}

/** Run a Boat call for a record; a failure is written to the record so reactive UIs see it. */
async function tracked<T>(
  ctx: ActionCtx,
  record: SandboxRecord,
  call: () => Promise<T>,
) {
  try {
    return await call();
  } catch (error) {
    await ctx.runMutation(internal.sandboxes.fail, {
      id: record._id,
      error: errorMessage(error),
    });
    throw error;
  }
}

/** POST with Boat's Idempotency-Key, waiting out a concurrent first attempt. */
async function idempotentPost(path: string, token: string, body: object) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await boat(sandboxResponse, "POST", path, {
        body,
        headers: { "Idempotency-Key": token },
      });
    } catch (error) {
      const inProgress =
        error instanceof BoatApiError &&
        error.code === "idempotency_in_progress";
      if (!inProgress || attempt >= 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

async function getSandbox(sandboxId: string) {
  return (await boat(sandboxResponse, "GET", sandboxPath(sandboxId))).sandbox;
}

/**
 * Create (or fork) into the record for (ownerId, key). The record is reserved first and its token is
 * Boat's Idempotency-Key, so a retry after a lost response gets the same sandbox, never a second one.
 */
async function provision(
  ctx: ActionCtx,
  ownerId: string,
  key: string,
  path: string,
  body: object,
  name?: string,
): Promise<PublicRecord> {
  const record: SandboxRecord = await ctx.runMutation(
    internal.sandboxes.reserve,
    { ownerId, key, token: crypto.randomUUID() },
  );
  const linkedId = record.sandboxId;
  if (linkedId) {
    return await tracked(ctx, record, async () =>
      sync(ctx, record, await getSandbox(linkedId)),
    );
  }
  return await tracked(ctx, record, async () => {
    let { sandbox } = await idempotentPost(path, record.token, body);
    if (name) {
      try {
        ({ sandbox } = await boat(
          sandboxResponse,
          "PATCH",
          sandboxPath(sandbox.id),
          { body: { name } },
        ));
      } catch (error) {
        await sync(ctx, record, sandbox); // keep the link: the sandbox exists and bills
        throw error;
      }
    }
    return await sync(ctx, record, sandbox);
  });
}

export const create = action({
  args: { ...identity, options: v.optional(createOptions) },
  returns: publicRecord,
  handler: async (ctx, args): Promise<PublicRecord> => {
    const { name, ...body } = args.options ?? {};
    return await provision(
      ctx,
      args.ownerId,
      args.key,
      "/sandboxes",
      body,
      name,
    );
  },
});

/** Disk-level copy of a sandbox into a new record under `newKey`. Safe to retry: same newKey, same fork. */
export const fork = action({
  args: { ...identity, newKey: v.string(), options: v.optional(resumeOptions) },
  returns: publicRecord,
  handler: async (ctx, args): Promise<PublicRecord> => {
    const source = await requireLinked(ctx, args.ownerId, args.key);
    return await provision(
      ctx,
      args.ownerId,
      args.newKey,
      sandboxPath(source.sandboxId, "/fork"),
      args.options ?? {},
    );
  },
});

export const refresh = action({
  args: identity,
  returns: publicRecord,
  handler: async (ctx, args): Promise<PublicRecord> => {
    const record = await requireLinked(ctx, args.ownerId, args.key);
    return await tracked(ctx, record, async () =>
      sync(ctx, record, await getSandbox(record.sandboxId)),
    );
  },
});

export const stop = action({
  args: { ...identity, force: v.optional(v.boolean()) },
  returns: publicRecord,
  handler: async (ctx, args): Promise<PublicRecord> => {
    const record = await requireLinked(ctx, args.ownerId, args.key);
    return await tracked(ctx, record, async () => {
      const { sandbox } = await boat(
        sandboxResponse,
        "POST",
        sandboxPath(record.sandboxId, "/stop"),
        { body: args.force ? { force: true } : {} },
      );
      return await sync(ctx, record, sandbox);
    });
  },
});

export const resume = action({
  args: { ...identity, options: v.optional(resumeOptions) },
  returns: publicRecord,
  handler: async (ctx, args): Promise<PublicRecord> => {
    const record = await requireLinked(ctx, args.ownerId, args.key);
    return await tracked(ctx, record, async () => {
      const { sandbox } = await boat(
        sandboxResponse,
        "POST",
        sandboxPath(record.sandboxId, "/resume"),
        { body: args.options ?? {} },
      );
      return await sync(ctx, record, sandbox);
    });
  },
});

/** Permanently delete the sandbox and its snapshots, then forget the record. */
export const destroy = action({
  args: identity,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const record: SandboxRecord | null = await ctx.runQuery(
      internal.sandboxes.find,
      args,
    );
    if (!record) return null;
    const sandboxId = record.sandboxId;
    if (sandboxId) {
      await tracked(ctx, record, async () => {
        try {
          await boat(z.object({}), "DELETE", sandboxPath(sandboxId), {
            headers: { "X-Ascii-Confirm-Delete": sandboxId },
          });
        } catch (error) {
          if (!(error instanceof BoatApiError && error.status === 404)) {
            throw error;
          }
        }
      });
    }
    await ctx.runMutation(internal.sandboxes.remove, { id: record._id });
    return null;
  },
});

/** Follows a sandbox through provisioning/archiving so `get` and `list` stay live without the app polling. */
export const settle = internalAction({
  args: { id: v.id("sandboxes"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const record: SandboxRecord | null = await ctx.runQuery(
      internal.sandboxes.byId,
      { id: args.id },
    );
    if (!record?.sandboxId || !TRANSITIONAL.has(record.state)) return null;
    let state = record.state;
    try {
      const synced: SandboxRecord | null = await ctx.runMutation(
        internal.sandboxes.sync,
        { id: record._id, sandbox: await getSandbox(record.sandboxId) },
      );
      state = synced?.state ?? "gone";
    } catch (error) {
      await ctx.runMutation(internal.sandboxes.fail, {
        id: record._id,
        error: errorMessage(error),
      });
    }
    if (TRANSITIONAL.has(state) && args.attempt < 120) {
      const delay = args.attempt < 30 ? 2_000 : 10_000;
      await ctx.scheduler.runAfter(delay, internal.lifecycle.settle, {
        id: args.id,
        attempt: args.attempt + 1,
      });
    }
    return null;
  },
});
