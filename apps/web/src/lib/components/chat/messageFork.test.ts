import { describe, expect, test } from "vitest";
import {
  canForkMessage,
  collectForkPrefix,
  collectSessionForkPrefix,
  FORK_PROMPT_CHAR_LIMIT,
  forkDialogSummary,
  forkThreadTitle,
  formatForkPrompt,
} from "@eva/shared";
import {
  DEMO_FORK_MESSAGES,
  DEMO_FORK_PREFIX,
  DEMO_FORK_THROUGH_ID,
} from "./messageFork";

const FORK_INSTRUCTION =
  "Continue this conversation from the last message above. Do not redo earlier work unless asked.";

describe("message fork", () => {
  test("collects turns through the chosen message and skips later ones", () => {
    expect(collectForkPrefix(DEMO_FORK_MESSAGES, DEMO_FORK_THROUGH_ID)).toEqual(
      DEMO_FORK_PREFIX,
    );
    expect(collectForkPrefix(DEMO_FORK_MESSAGES, "missing")).toBeNull();
    expect(
      collectForkPrefix(
        [
          {
            id: "sys",
            role: "assistant",
            content: "Sandbox started",
            isSystemAlert: true,
          },
          ...DEMO_FORK_MESSAGES,
        ],
        DEMO_FORK_THROUGH_ID,
      )?.turns,
    ).toEqual(DEMO_FORK_PREFIX.turns);
  });

  test("prompt lists the prefix and asks to continue", () => {
    const prompt = formatForkPrompt(DEMO_FORK_PREFIX);
    expect(prompt).toContain("<forked_thread>");
    expect(prompt).toContain("turns: 2");
    expect(prompt).toContain("You:\nThe invoices table is empty on billing.");
    expect(prompt).toContain("Eva:\nI'll seed the invoices empty state");
    expect(prompt).not.toContain("upgrade banner");
    expect(prompt).toContain(
      "Continue this conversation from the last message above",
    );
  });

  test("title and summary come from the first user turn", () => {
    expect(forkThreadTitle(DEMO_FORK_PREFIX)).toBe(
      "Fork · The invoices table is empty on billing.",
    );
    expect(forkDialogSummary(DEMO_FORK_PREFIX)).toBe(
      "2 messages · new chat from here",
    );
    expect(
      DEMO_FORK_MESSAGES.filter((message) => canForkMessage(message)),
    ).toHaveLength(DEMO_FORK_MESSAGES.length);
    expect(
      canForkMessage({ content: "Sandbox started", isSystemAlert: true }),
    ).toBe(false);
  });

  test("an oversized transcript keeps its closing tag and instruction", () => {
    const prompt = formatForkPrompt({
      throughMessageId: "asst-20",
      turns: Array.from({ length: 20 }, (_, index) => ({
        messageId: `msg-${index}`,
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        text: "invoice ".repeat(400),
      })),
    });
    expect(prompt.length).toBeLessThanOrEqual(FORK_PROMPT_CHAR_LIMIT);
    expect(prompt).toContain("<forked_thread>");
    expect(prompt).toContain("</forked_thread>");
    expect(prompt.endsWith(FORK_INSTRUCTION)).toBe(true);
  });

  test("a whole-session fork keeps the latest turns that fit", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({
      id: `msg-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index} ${"invoice ".repeat(200)}`,
    }));
    const prefix = collectSessionForkPrefix([
      ...messages,
      { id: "alert", role: "assistant", content: "Sandbox stopped", isSystemAlert: true },
    ]);
    expect(prefix?.throughMessageId).toBe("msg-39");
    expect(prefix?.turns.at(-1)?.messageId).toBe("msg-39");
    expect(prefix?.turns[0]?.messageId).not.toBe("msg-0");
    const prompt = prefix ? formatForkPrompt(prefix) : "";
    expect(prompt).toContain("turn 39");
    expect(prompt.endsWith(FORK_INSTRUCTION)).toBe(true);
  });
});
