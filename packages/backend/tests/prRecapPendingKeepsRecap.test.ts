import { convexTest } from "convex-test";
import prosemirrorSync from "@convex-dev/prosemirror-sync/test";
import workflow from "@convex-dev/workflow/test";
import { expect, test, vi } from "vitest";
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
  "a started and then failed run keeps the recap, commit and model on show",
  async () => {
    // Hold the workflow `startPrRecap` schedules: this test is about the doc
    // writes, not the run, and a background run would race the assertions.
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    prosemirrorSync.register(t);
    workflow.register(t);
    const { repoId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { clerkId: "clerk|recap" });
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "vvedantb",
        name: "eva",
        installationId: 1,
        connectedBy: userId,
      });
      return { repoId, userId };
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
      run: { model: "claude:sonnet", fastMode: true },
      prRecapStatus: "ready",
    });

    // The real start path: flips the doc to pending and starts the workflow.
    await t.mutation(internal.docs.startPrRecap, {
      repoId,
      userId,
      installationId: 1,
      owner: "vvedantb",
      name: "eva",
      prUrl: PR_URL,
      prNumber: 1,
      prTitle: "Recap",
      headSha: "new",
      model: "claude:opus",
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
    // The badge still names the run that wrote the recap on show.
    expect(failed?.prRecapModel).toBe("claude:sonnet");
    expect(failed?.fastMode).toBe(true);

    await t.mutation(internal.docs.upsertPrRecapDoc, {
      ...base,
      headSha: "new",
      content: "## Summary\nSecond recap.",
      recapWalkthrough: STEPS,
      run: { model: "claude:opus" },
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
    expect(ready.doc?.prRecapModel).toBe("claude:opus");
    // A trait the new run did not set is cleared, not carried over.
    expect(ready.doc?.fastMode).toBeUndefined();
    // The replaced recap went to history, even though its status was "error".
    expect(ready.versions.map((version) => version.content)).toEqual([
      "## Summary\nFirst recap.",
    ]);
    vi.useRealTimers();
  },
  TIMEOUT_MS,
);
