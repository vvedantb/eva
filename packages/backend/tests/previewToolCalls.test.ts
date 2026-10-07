import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  ERROR_MAX_CHARS,
  RESULT_JSON_MAX_CHARS,
  clearPreviewToolCallsForParent,
} from "../convex/_previewToolCalls/calls";
import {
  awaitPreviewToolCall,
  type PreviewToolRelay,
} from "../convex/_mcp/previewTools";

/**
 * The agent → live-preview WebMCP relay. Several Eva tabs can have one chat
 * open, so `claim` must elect exactly one executor, `complete` must only
 * accept that executor's answer, and the page-controlled payload must be
 * capped before it reaches the agent's context. These run the real mutations,
 * because the properties are behavioural (serialised status transitions).
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|preview-tool-calls";

async function fixture() {
  const t = convexTest(schema, modules);
  const sessionId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "preview-tool-calls-test",
      installationId: 1,
      connectedBy: userId,
    });
    return ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "WebMCP relay",
      status: "active",
    });
  });
  const asUser = t.withIdentity({ subject: CLERK_ID });
  const callId = await t.mutation(internal.previewToolCalls.create, {
    entityKind: "session",
    entityId: sessionId,
    kind: "invoke",
    name: "add_todo",
    argumentsJson: '{"title":"x"}',
  });
  if (callId === null) throw new Error("fixture: create returned null");
  const read = () => t.query(internal.previewToolCalls.get, { id: callId });
  return { t, asUser, sessionId, callId, read };
}

describe("previewToolCalls relay", () => {
  test(
    "lists the pending row and elects exactly one claiming tab",
    async () => {
      const f = await fixture();
      const pending = await f.asUser.query(api.previewToolCalls.listPending, {
        parentId: f.sessionId,
      });
      expect(pending).toEqual([
        {
          _id: f.callId,
          kind: "invoke",
          name: "add_todo",
          argumentsJson: '{"title":"x"}',
          createdAt: expect.any(Number),
        },
      ]);

      const first = await f.asUser.mutation(api.previewToolCalls.claim, {
        id: f.callId,
        clientId: "tab-a",
      });
      const second = await f.asUser.mutation(api.previewToolCalls.claim, {
        id: f.callId,
        clientId: "tab-b",
      });
      expect([first, second]).toEqual([true, false]);
      expect((await f.read())?.claimedBy).toBe("tab-a");
      expect(
        await f.asUser.query(api.previewToolCalls.listPending, {
          parentId: f.sessionId,
        }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "ignores a completion from a tab that did not win the claim",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.previewToolCalls.claim, {
        id: f.callId,
        clientId: "tab-a",
      });
      await f.asUser.mutation(api.previewToolCalls.complete, {
        id: f.callId,
        clientId: "tab-b",
        resultJson: '"forged"',
      });
      expect((await f.read())?.status).toBe("claimed");

      await f.asUser.mutation(api.previewToolCalls.complete, {
        id: f.callId,
        clientId: "tab-a",
        resultJson: '{"ok":true}',
      });
      const row = await f.read();
      expect(row?.status).toBe("done");
      expect(row?.resultJson).toBe('{"ok":true}');
    },
    TIMEOUT_MS,
  );

  test(
    "caps the result and error text the page writes back",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.previewToolCalls.claim, {
        id: f.callId,
        clientId: "tab-a",
      });
      await f.asUser.mutation(api.previewToolCalls.complete, {
        id: f.callId,
        clientId: "tab-a",
        resultJson: "x".repeat(RESULT_JSON_MAX_CHARS + 500),
      });
      const done = await f.read();
      expect(done?.resultJson).toHaveLength(RESULT_JSON_MAX_CHARS);
      expect(done?.resultJson).toContain("[truncated by Eva:");

      const other = await f.t.mutation(internal.previewToolCalls.create, {
        entityKind: "session",
        entityId: f.sessionId,
        kind: "list",
      });
      if (other === null) throw new Error("create returned null");
      await f.asUser.mutation(api.previewToolCalls.claim, {
        id: other,
        clientId: "tab-a",
      });
      await f.asUser.mutation(api.previewToolCalls.complete, {
        id: other,
        clientId: "tab-a",
        error: "e".repeat(ERROR_MAX_CHARS * 3),
      });
      const failed = await f.t.query(internal.previewToolCalls.get, {
        id: other,
      });
      expect(failed?.status).toBe("error");
      expect(failed?.error).toHaveLength(ERROR_MAX_CHARS);
      expect(failed?.error).toContain("[truncated by Eva:");
    },
    TIMEOUT_MS,
  );

  test(
    "expire only touches unfinished rows and reports where it gave up",
    async () => {
      const f = await fixture();
      expect(
        await f.t.mutation(internal.previewToolCalls.expire, {
          id: f.callId,
          error: "timed out",
        }),
      ).toBe("pending");
      expect((await f.read())?.status).toBe("error");
      // A late tab can no longer claim an expired row.
      expect(
        await f.asUser.mutation(api.previewToolCalls.claim, {
          id: f.callId,
          clientId: "tab-a",
        }),
      ).toBe(false);

      const finished = await f.t.mutation(internal.previewToolCalls.create, {
        entityKind: "session",
        entityId: f.sessionId,
        kind: "list",
      });
      if (finished === null) throw new Error("create returned null");
      await f.asUser.mutation(api.previewToolCalls.claim, {
        id: finished,
        clientId: "tab-a",
      });
      await f.asUser.mutation(api.previewToolCalls.complete, {
        id: finished,
        clientId: "tab-a",
        resultJson: "[]",
      });
      expect(
        await f.t.mutation(internal.previewToolCalls.expire, {
          id: finished,
          error: "timed out",
        }),
      ).toBeNull();
      const row = await f.t.query(internal.previewToolCalls.get, {
        id: finished,
      });
      expect(row?.status).toBe("done");
      expect(row?.resultJson).toBe("[]");
    },
    TIMEOUT_MS,
  );

  test(
    "sandbox-stop cleanup removes every row for the chat",
    async () => {
      const f = await fixture();
      await f.t.run((ctx) =>
        clearPreviewToolCallsForParent(ctx.db, f.sessionId),
      );
      expect(await f.read()).toBeNull();
    },
    TIMEOUT_MS,
  );
});

describe("awaitPreviewToolCall", () => {
  const timing = { pollMs: 1, timeoutMs: 20 };

  /** A relay whose row never finishes, as if no tab (or a hung tool) ran it. */
  async function relayStuckAt(status: "pending" | "claimed") {
    const f = await fixture();
    const stored = await f.read();
    if (stored === null) throw new Error("fixture row missing");
    const row: Doc<"previewToolCalls"> = { ...stored, status };
    const relay: PreviewToolRelay = {
      create: async () => row._id,
      get: async () => row,
      expire: async () => status,
    };
    return { relay, id: row._id };
  }

  test(
    "says no tab picked it up when the row was never claimed",
    async () => {
      const { relay, id } = await relayStuckAt("pending");
      const result = await awaitPreviewToolCall(relay, id, timing);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("No open Eva tab ran");
    },
    TIMEOUT_MS,
  );

  test(
    "says the page's tool hung when a tab claimed it",
    async () => {
      const { relay, id } = await relayStuckAt("claimed");
      const result = await awaitPreviewToolCall(relay, id, timing);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("did not reply");
    },
    TIMEOUT_MS,
  );
});
