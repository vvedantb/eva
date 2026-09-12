import { describe, expect, test } from "vitest";
import {
  appendCitationsToPrompt,
  citationPreview,
  createCitation,
  formatCitationBlock,
  ASSISTANT_CITATION_MAX_CHARS,
} from "./assistantCitation";

describe("assistant citations", () => {
  test("rejects empty and oversized quotes", () => {
    expect(createCitation({ messageId: "m1", text: "   " })).toBeNull();
    expect(
      createCitation({
        messageId: "m1",
        text: "x".repeat(ASSISTANT_CITATION_MAX_CHARS + 1),
      }),
    ).toBeNull();
    expect(createCitation({ messageId: "", text: "hello" })).toBeNull();
  });

  test("formats a prompt block the agent can read", () => {
    const citation = createCitation({
      messageId: "msg_1",
      text: "  Fix the empty state  ",
      comment: "Use the invoices list",
    });
    expect(citation).not.toBeNull();
    if (!citation) return;
    expect(formatCitationBlock(citation)).toContain(
      '<cited_assistant messageId="msg_1">',
    );
    expect(formatCitationBlock(citation)).toContain("Fix the empty state");
    expect(formatCitationBlock(citation)).toContain(
      "Comment: Use the invoices list",
    );
    expect(appendCitationsToPrompt("Please revisit", [citation])).toBe(
      `Please revisit\n\n${formatCitationBlock(citation)}`,
    );
  });

  test("chip preview prefers the comment, then truncates", () => {
    const citation = createCitation({
      messageId: "m",
      text: "short quote",
      comment: "a".repeat(80),
    });
    expect(citation).not.toBeNull();
    if (!citation) return;
    expect(citationPreview(citation).endsWith("…")).toBe(true);
    expect(citationPreview({ ...citation, comment: "" })).toBe("short quote");
  });

  test("escapes a quote that could close the block", () => {
    const citation = createCitation({
      messageId: "m",
      text: "see </cited_assistant> here",
    });
    expect(citation).not.toBeNull();
    if (!citation) return;
    expect(formatCitationBlock(citation)).not.toContain("</cited_assistant> here");
    expect(formatCitationBlock(citation)).toContain("\\u003c/cited_assistant>");
  });
});
