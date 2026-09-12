import { mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/** Validates the provided admin key against the expected environment variable. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function validateAdminKey(key: string): void {
  const expected = process.env.EXTENSION_ADMIN_KEY;
  if (!expected || !timingSafeEqual(key, expected)) {
    throw new Error("Unauthorized");
  }
}

/** Returns the latest extension release with its download URL (internal query). */
export const getLatestInternal = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      version: v.string(),
      crxUrl: v.union(v.string(), v.null()),
      releasedAt: v.number(),
      notes: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const release = await ctx.db
      .query("extensionReleases")
      .order("desc")
      .first();

    if (!release) return null;

    const crxUrl = await ctx.storage.getUrl(release.crxStorageId);

    return {
      version: release.version,
      crxUrl,
      releasedAt: release.releasedAt,
      notes: release.notes ?? null,
    };
  },
});

/** Generates a temporary upload URL for uploading a CRX file (admin-only). */
export const generateUploadUrl = mutation({
  args: { adminKey: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    validateAdminKey(args.adminKey);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Records a new extension release, replacing any existing release with the same version. */
export const recordRelease = mutation({
  args: {
    adminKey: v.string(),
    version: v.string(),
    crxStorageId: v.id("_storage"),
    notes: v.optional(v.string()),
  },
  returns: v.id("extensionReleases"),
  handler: async (ctx, args) => {
    validateAdminKey(args.adminKey);

    const existing = await ctx.db
      .query("extensionReleases")
      .withIndex("by_version", (q) => q.eq("version", args.version))
      .first();

    if (existing) {
      await ctx.storage.delete(existing.crxStorageId);
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert("extensionReleases", {
      version: args.version,
      crxStorageId: args.crxStorageId,
      releasedAt: Date.now(),
      notes: args.notes,
    });
  },
});
