import { v } from "convex/values";
import { type Doc, type Id } from "./_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";

/** Regex for safe filenames: alphanumeric, dash, underscore, dot only. */
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;

/** Storage ids for a file: new chunks[], or legacy single storageId, else []. */
function fileChunkIds(file: Doc<"sandboxConfigFiles">): Array<Id<"_storage">> {
  return file.chunks ?? (file.storageId ? [file.storageId] : []);
}

/** Deletes every storage blob for a file (legacy single-blob and/or chunks). */
async function deleteFileBlobs(
  ctx: MutationCtx,
  file: Doc<"sandboxConfigFiles">,
): Promise<void> {
  if (file.storageId) {
    await ctx.storage.delete(file.storageId);
  }
  for (const chunkId of file.chunks ?? []) {
    await ctx.storage.delete(chunkId);
  }
}

/**
 * All config files across sibling repos sharing the anchor repo's owner/name.
 * Returns [] when the anchor repo is missing. Preserves sibling-then-file order
 * so callers can rely on last-write-wins on filename collision.
 */
async function collectSiblingConfigFiles(
  ctx: QueryCtx,
  repoId: Id<"githubRepos">,
): Promise<Array<Doc<"sandboxConfigFiles">>> {
  const anchorRepo = await ctx.db.get(repoId);
  if (!anchorRepo) return [];
  const siblings = await ctx.db
    .query("githubRepos")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", anchorRepo.owner).eq("name", anchorRepo.name),
    )
    .collect();
  const files: Array<Doc<"sandboxConfigFiles">> = [];
  for (const sibling of siblings) {
    const sameTeam =
      sibling._id === anchorRepo._id ||
      (anchorRepo.teamId !== undefined &&
        sibling.teamId === anchorRepo.teamId) ||
      (anchorRepo.teamId === undefined &&
        sibling.connectedBy === anchorRepo.connectedBy);
    if (!sameTeam) continue;
    const siblingFiles = await ctx.db
      .query("sandboxConfigFiles")
      .withIndex("by_repo", (q) => q.eq("repoId", sibling._id))
      .collect();
    files.push(...siblingFiles);
  }
  return files;
}

/** Generates an upload URL for a sandbox config file (or one chunk of one). */
export const generateUploadUrl = authMutation({
  args: { repoId: v.id("githubRepos") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Saves a sandbox config file record from an array of chunk storage IDs.
 * Replaces any existing file with the same name (deleting all of its chunks).
 * For files small enough to fit in a single upload, pass a 1-element array.
 */
export const save = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    chunks: v.array(v.id("_storage")),
    fileName: v.string(),
    fileSize: v.number(),
  },
  returns: v.id("sandboxConfigFiles"),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    if (args.chunks.length === 0) {
      throw new Error("At least one chunk is required");
    }

    // Validate filename for shell safety
    if (!SAFE_FILENAME_REGEX.test(args.fileName)) {
      throw new Error(
        "Invalid filename. Only alphanumeric characters, dashes, underscores, and dots are allowed.",
      );
    }

    // Check for existing file with same name and replace it
    const existing = await ctx.db
      .query("sandboxConfigFiles")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .filter((q) => q.eq(q.field("fileName"), args.fileName))
      .first();

    if (existing) {
      // Delete all old storage blobs (legacy single-blob and/or chunks)
      await deleteFileBlobs(ctx, existing);
      // Update the record (clear legacy storageId, set chunks)
      await ctx.db.patch(existing._id, {
        storageId: undefined,
        chunks: args.chunks,
        fileSize: args.fileSize,
        uploadedBy: ctx.userId,
        createdAt: Date.now(),
      });
      return existing._id;
    }

    // Insert new record
    return await ctx.db.insert("sandboxConfigFiles", {
      repoId: args.repoId,
      chunks: args.chunks,
      fileName: args.fileName,
      fileSize: args.fileSize,
      uploadedBy: ctx.userId,
      createdAt: Date.now(),
    });
  },
});

/** Lists all sandbox config files for a repo. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      _id: v.id("sandboxConfigFiles"),
      _creationTime: v.number(),
      repoId: v.id("githubRepos"),
      storageId: v.optional(v.id("_storage")),
      chunks: v.optional(v.array(v.id("_storage"))),
      fileName: v.string(),
      fileSize: v.number(),
      uploadedBy: v.id("users"),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    return await ctx.db
      .query("sandboxConfigFiles")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .collect();
  },
});

/** Removes a sandbox config file and all of its storage blobs. */
export const remove = authMutation({
  args: { id: v.id("sandboxConfigFiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const file = await ctx.db.get(args.id);
    if (!file) return null;

    if (!(await hasRepoAccess(ctx.db, file.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await deleteFileBlobs(ctx, file);
    await ctx.db.delete(args.id);
    return null;
  },
});

/**
 * Internal query returning each config file as an ordered list of chunk URLs.
 * Legacy single-blob records are returned as a 1-element chunkUrls array.
 * The snapshot/sandbox builder downloads each chunk in order and concatenates.
 *
 * Aggregates across all sibling repos sharing the snapshot anchor's owner/name —
 * one snapshot is built per (owner, name) and serves the root repo plus every
 * sub-app, so config files uploaded against any sibling repoId must be baked in.
 * Last write wins on filename collision (later sibling overrides earlier).
 */
export const getConfigFilesForSnapshot = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      fileName: v.string(),
      chunkUrls: v.array(v.union(v.string(), v.null())),
    }),
  ),
  handler: async (ctx, args) => {
    const files = await collectSiblingConfigFiles(ctx, args.repoId);

    const filesByName = new Map<
      string,
      { fileName: string; chunkUrls: Array<string | null> }
    >();
    for (const file of files) {
      const chunkUrls: Array<string | null> = [];
      for (const chunkId of fileChunkIds(file)) {
        chunkUrls.push(await ctx.storage.getUrl(chunkId));
      }
      filesByName.set(file.fileName, { fileName: file.fileName, chunkUrls });
    }
    return Array.from(filesByName.values());
  },
});

/**
 * Stable identity keys for the config files baked into a snapshot — same
 * sibling aggregation as getConfigFilesForSnapshot but returns
 * `fileName:fileSize:chunkIds` strings (storage ids are immutable, unlike the
 * signed chunk URLs). Used to fingerprint image/seed inputs for skip decisions.
 */
export const getConfigFileKeys = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const files = await collectSiblingConfigFiles(ctx, args.repoId);
    const keysByName = new Map<string, string>();
    for (const file of files) {
      keysByName.set(
        file.fileName,
        `${file.fileName}:${file.fileSize}:${fileChunkIds(file).join(",")}`,
      );
    }
    return Array.from(keysByName.values()).sort();
  },
});
