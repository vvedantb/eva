import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const chatPanel = readFileSync(join(here, "../ChatPanel.tsx"), "utf8");
const sessionDetail = readFileSync(
  join(here, "../SessionDetailClient.tsx"),
  "utf8",
);

/**
 * A plan card in the transcript must stay on the message that proposed it
 * (fix 4029e4bf5). The old fallback rendered `session.planContent` after the
 * latest assistant message, so the card followed the chat to the bottom on
 * every new turn. Unanchored plan content belongs in the Plan tab only.
 */
describe("transcript plan cards stay on their proposing message", () => {
  test("ChatPanel renders one plan card, fed only by the message lookup", () => {
    expect(chatPanel.split("<ProposedPlanCard").length - 1).toBe(1);
    expect(chatPanel).toContain(
      "const plan = proposedPlanForMessage(capturedPlans, messageId);",
    );
    expect(chatPanel).toContain("if (!plan) return null;");
  });

  test("ChatPanel has no unanchored planContent fallback", () => {
    // Reading `planContent` or pinning to the latest assistant message is the
    // sticky-plan regression coming back.
    expect(chatPanel).not.toContain("planContent");
    expect(chatPanel).not.toContain("lastAssistantMessageId");
    expect(sessionDetail).not.toMatch(/<ChatPanel[^>]*planContent=/);
  });
});
