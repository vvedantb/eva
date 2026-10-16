import { convexTest } from "convex-test";
import prosemirrorSync from "@convex-dev/prosemirror-sync/test";
import { expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * A recap run that starts on an existing recap only flips it to pending: the
 * summary, walkthrough and commit on show stay until the ready write replaces
 * them, so a failed run leaves the last good recap (and an honest stale banner)
 * instead of a "Generating…" placeholder. The ready write still keeps history.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const PR_URL = "https://github.com/vvedantb/eva/pull/1";
const STEPS = [{ title: "Core", summary: "The idea.", files: ["a.ts"] }];

test(
  "a pending and then failed run keeps the recap on show",
  async () => {
    const t = convexTest(schema, modules);
    prosemirrorSync.register(t);
    const repoId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { clerkId: "clerk|recap" });
      return await ctx.db.insert("githubRepos", {
        owner: "vvedantb",
        name: "eva",
        installationId: 1,
        connectedBy: userId,
      });
    });
    const base = {
      repoId,
      prUrl: PR_URL,
      prNumber: 1,
      title: "PR #1 — Recap",
    };

    const docId = await t.mutation(internal.docs.upsertPrRecapDoc, {
      ...base,
      headSha: "old",
      content: "## Summary\nFirst recap.",
      recapWalkthrough: STEPS,
      prRecapStatus: "ready",
    });

    await t.mutation(internal.docs.upsertPrRecapDoc, {
      ...base,
      headSha: "new",
      content: "_Generating recap…_",
      prRecapStatus: "pending",
    });
    await t.mutation(internal.docs.patchPrRecapStatus, {
      docId,
      prRecapStatus: "error",
      prRecapError: "Sandbox died",
      activeWorkflowId: null,
    });

    const failed = await t.run(async (ctx) => await ctx.db.get(docId));
    expect(failed?.content).toBe("## Summary\nFirst recap.");
    expect(failed?.recapWalkthrough).toEqual(STEPS);
    expect(failed?.headSha).toBe("old");
    expect(failed?.prRecapStatus).toBe("error");

    await t.mutation(internal.docs.upsertPrRecapDoc, {
      ...base,
      headSha: "new",
      content: "## Summary\nSecond recap.",
      recapWalkthrough: STEPS,
      prRecapStatus: "ready",
    });

    const ready = await t.run(async (ctx) => ({
      doc: await ctx.db.get(docId),
      versions: await ctx.db
        .query("docVersions")
        .withIndex("by_doc", (q) => q.eq("docId", docId))
        .collect(),
    }));
    expect(ready.doc?.content).toBe("## Summary\nSecond recap.");
    expect(ready.doc?.headSha).toBe("new");
    // The replaced recap went to history, even though its status was "error".
    expect(ready.versions.map((version) => version.content)).toEqual([
      "## Summary\nFirst recap.",
    ]);
  },
  TIMEOUT_MS,
);
