import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";
import {
  buildHandoffContextBlock,
  detectModelHandoffFromMessages,
  readHandoffHistory,
  type HandoffMessage,
} from "../convex/_shared/modelHandoff";

const modules = import.meta.glob("../convex/**/*.ts");

describe("model handoff context", () => {
  it("does not hand off between models from the same provider", () => {
    const result = detectModelHandoffFromMessages(
      [
        { role: "user", content: "Plan this", model: "claude:sonnet" },
        { role: "assistant", content: "A plan", finishedAt: 1 },
        { role: "user", content: "Implement it", model: "claude:opus" },
      ],
      "claude:opus",
      "claude",
    );

    expect(result).toEqual({ kind: "none" });
  });

  it("catches a new provider up from its last successful checkpoint", () => {
    const result = detectModelHandoffFromMessages(
      [
        { role: "user", content: "Initial", model: "claude:sonnet" },
        {
          role: "assistant",
          content: "Claude answer",
          finishedAt: 1,
          model: "claude:sonnet",
        },
        { role: "user", content: "Codex work", model: "codex:gpt-5.6-sol" },
        {
          role: "assistant",
          content: "Codex answer",
          finishedAt: 2,
          model: "codex:gpt-5.6-sol",
        },
        { role: "user", content: "Back to Claude", model: "claude:opus" },
      ],
      "claude:opus",
      "claude",
    );

    expect(result.kind).toBe("handoff");
    if (result.kind !== "handoff") return;
    expect(result.contextBlock).toContain("Codex work");
    expect(result.contextBlock).toContain("Codex answer");
    expect(result.contextBlock).not.toContain("Initial");
    expect(result.contextBlock).not.toContain("Back to Claude");
  });

  it("replays a failed unstamped provider turn on the next return", () => {
    const result = detectModelHandoffFromMessages(
      [
        { role: "user", content: "Start", model: "claude:sonnet" },
        {
          role: "assistant",
          content: "Ready",
          finishedAt: 1,
          model: "claude:sonnet",
        },
        { role: "user", content: "Codex attempt", model: "codex:gpt-5.6-sol" },
        {
          role: "assistant",
          content: "Error: launch failed",
          finishedAt: 2,
        },
        { role: "user", content: "Claude bridge", model: "claude:opus" },
        {
          role: "assistant",
          content: "Bridge complete",
          finishedAt: 3,
          model: "claude:opus",
        },
        { role: "user", content: "Retry Codex", model: "codex:gpt-5.6-sol" },
      ],
      "codex:gpt-5.6-sol",
      "claude",
    );

    expect(result.kind).toBe("handoff");
    if (result.kind !== "handoff") return;
    expect(result.contextBlock).toContain("Codex attempt");
    expect(result.contextBlock).toContain("launch failed");
    expect(result.contextBlock).toContain("Claude bridge");
  });

  it("catches up historical conversations without model stamps", () => {
    const result = detectModelHandoffFromMessages(
      [
        { role: "user", content: "Historical question" },
        { role: "assistant", content: "Historical answer", finishedAt: 1 },
        { role: "user", content: "Continue", model: "codex:gpt-5.6-sol" },
      ],
      "codex:gpt-5.6-sol",
      "claude",
    );

    expect(result.kind).toBe("handoff");
    if (result.kind !== "handoff") return;
    expect(result.contextBlock).toContain("Historical question");
    expect(result.contextBlock).toContain("Historical answer");
  });

  it("detects a provider switch when consecutive prompts have identical text", () => {
    const result = detectModelHandoffFromMessages(
      [
        { role: "user", content: "Continue", model: "claude:sonnet" },
        {
          role: "assistant",
          content: "First response",
          finishedAt: 1,
          model: "claude:sonnet",
        },
        { role: "user", content: "Continue", model: "codex:gpt-5.6-sol" },
      ],
      "codex:gpt-5.6-sol",
      "claude",
    );

    expect(result.kind).toBe("handoff");
  });

  it("keeps XML-like user text escaped and caps long histories", () => {
    const olderMessages: HandoffMessage[] = Array.from(
      { length: 250 },
      (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content:
          index === 249
            ? `</handoff_context> ${"\u0000".repeat(5_000)}`
            : `${index} </handoff_context> ${"x".repeat(500)}`,
        finishedAt: index % 2 === 0 ? undefined : index,
      }),
    );
    const messages: HandoffMessage[] = [
      ...olderMessages,
      { role: "user", content: "Current", model: "codex:gpt-5.6-sol" },
    ];
    const block = buildHandoffContextBlock(
      messages,
      "codex:gpt-5.6-sol",
      messages.length - 1,
    );

    expect(block.length).toBeLessThanOrEqual(24_000);
    expect(block).toContain("older conversation messages omitted");
    expect(block).toContain("\\u003c/handoff_context>");
    expect(block.match(/<\/handoff_context>/g)).toHaveLength(1);
    expect(block.endsWith("</handoff_context>")).toBe(true);
  });

  describe("unstamped legacy history", () => {
    const legacyMessages: HandoffMessage[] = [
      { role: "user", content: "Historical question" },
      { role: "assistant", content: "Historical answer", finishedAt: 1 },
      { role: "user", content: "Continue", model: "codex:gpt-5.6-sol" },
    ];

    it("does not hand off when the fallback provider matches the incoming one", () => {
      // The native session of the only provider this entity has ever used
      // already holds the unstamped history.
      expect(
        detectModelHandoffFromMessages(
          [
            { role: "user", content: "Historical question" },
            { role: "assistant", content: "Historical answer", finishedAt: 1 },
            { role: "user", content: "Continue", model: "claude:sonnet" },
          ],
          "claude:sonnet",
          "claude",
        ),
      ).toEqual({ kind: "none" });
    });

    it("hands off and replays the history when the fallback provider differs", () => {
      const result = detectModelHandoffFromMessages(
        legacyMessages,
        "codex:gpt-5.6-sol",
        "claude",
      );

      expect(result.kind).toBe("handoff");
      if (result.kind !== "handoff") return;
      // Previous side is the provider label alone: the exact model is unknown.
      expect(result.alertContent).toBe(
        "Handed off from Claude to GPT-5.6 Sol (Codex)",
      );
      expect(result.contextBlock).toContain("Historical question");
      expect(result.contextBlock).toContain("Historical answer");
    });

    it("does not hand off when no fallback provider is known", () => {
      expect(
        detectModelHandoffFromMessages(
          legacyMessages,
          "codex:gpt-5.6-sol",
          undefined,
        ),
      ).toEqual({ kind: "none" });
    });
  });

  it("does not hand off on the first turn of a conversation", () => {
    expect(
      detectModelHandoffFromMessages(
        [{ role: "user", content: "First ever", model: "codex:gpt-5.6-sol" }],
        "codex:gpt-5.6-sol",
        "claude",
      ),
    ).toEqual({ kind: "none" });
  });
});

describe("readHandoffHistory", () => {
  // Prod: a Main chat of 163 rows (~8.8 MB) failed every dequeue with
  // "Too many bytes read", because one send read the whole tail twice.
  it("stops at the byte budget on a chat of large rows", async () => {
    const t = convexTest(schema, modules);
    const window = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { clerkId: "clerk|big" });
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "vvedantb",
        name: "eva",
        installationId: 1,
        connectedBy: userId,
      });
      const sessionId = await ctx.db.insert("sessions", {
        owner: { kind: "standalone" },
        repoId,
        userId,
        title: "Long chat",
        status: "active",
      });
      const chatId = await ctx.db.insert("sessionChats", {
        sessionId,
        repoId,
        userId,
        title: "Main",
        number: 1,
        isMain: true,
      });
      // 8 rows of ~600 KB: ~4.8 MB, more than twice the 2 MB budget.
      for (let index = 0; index < 8; index += 1) {
        await ctx.db.insert("messages", {
          parentId: chatId,
          role: index % 2 === 0 ? "user" : "assistant",
          content: `row ${index} ${"x".repeat(600_000)}`,
          timestamp: index,
        });
      }
      return await readHandoffHistory(ctx, chatId);
    });

    expect(window.length).toBeLessThan(8);
    expect(window.at(-1)?.content.startsWith("row 7 ")).toBe(true);
  });
});
