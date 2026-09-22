import { describe, expect, test } from "vitest";
import {
  collectCaseInsensitiveSubstringRanges,
  collectThreadFindDocuments,
  DEMO_THREAD_FIND_MESSAGES,
  DEMO_THREAD_FIND_QUERY,
  findThreadMatches,
  normalizeFindQuery,
  resolveThreadFindJump,
  shouldCaptureChatFindShortcut,
  stepThreadFindIndex,
  threadFindCountLabel,
} from "./threadFind";

describe("in-thread find", () => {
  test("matches case-insensitive non-overlapping substrings", () => {
    expect(collectCaseInsensitiveSubstringRanges("Invoice invoices", "invoice")).toEqual([
      { startOffset: 0, endOffset: 7 },
      { startOffset: 8, endOffset: 15 },
    ]);
    expect(collectCaseInsensitiveSubstringRanges("", "invoice")).toEqual([]);
    expect(normalizeFindQuery("  invoice  ")).toBe("invoice");
  });

  test("walks transcript documents in order", () => {
    const documents = collectThreadFindDocuments(
      DEMO_THREAD_FIND_MESSAGES.map((message) => ({
        id: message.id,
        text: message.text,
      })),
    );
    const matches = findThreadMatches(documents, DEMO_THREAD_FIND_QUERY);
    expect(matches.map((match) => match.messageId)).toEqual([
      "user-1",
      "asst-1",
      "asst-1",
    ]);
    expect(threadFindCountLabel(DEMO_THREAD_FIND_QUERY, matches.length, 0)).toBe(
      "1 / 3",
    );
    expect(threadFindCountLabel(DEMO_THREAD_FIND_QUERY, 0, 0)).toBe(
      "No results",
    );
  });

  test("next and previous wrap", () => {
    expect(stepThreadFindIndex(3, 0, "next")).toBe(1);
    expect(stepThreadFindIndex(3, 2, "next")).toBe(0);
    expect(stepThreadFindIndex(3, 0, "previous")).toBe(2);
    expect(stepThreadFindIndex(0, 0, "next")).toBe(-1);
    expect(resolveThreadFindJump(findThreadMatches([], "x"), 0)).toBeNull();
  });

  test("skips empty and flagged rows", () => {
    expect(
      collectThreadFindDocuments([
        { id: "a", text: "" },
        { id: "b", text: "keep" },
        { id: "c", text: "skip me", skip: true },
      ]),
    ).toEqual([{ messageId: "b", text: "keep" }]);
  });

  test("captures the shortcut inside the chat pane only", () => {
    expect(
      shouldCaptureChatFindShortcut({
        inChatPane: true,
        inFindBar: false,
        inEditable: false,
        isDocumentRoot: false,
      }),
    ).toBe(true);
    expect(
      shouldCaptureChatFindShortcut({
        inChatPane: false,
        inFindBar: false,
        inEditable: true,
        isDocumentRoot: false,
      }),
    ).toBe(false);
    expect(
      shouldCaptureChatFindShortcut({
        inChatPane: false,
        inFindBar: false,
        inEditable: false,
        isDocumentRoot: true,
      }),
    ).toBe(true);
    // The composer lives inside the chat pane: typing a prompt keeps the
    // browser's own find.
    expect(
      shouldCaptureChatFindShortcut({
        inChatPane: true,
        inFindBar: false,
        inEditable: true,
        isDocumentRoot: false,
      }),
    ).toBe(false);
    // The find bar's input is editable too, and it must still capture.
    expect(
      shouldCaptureChatFindShortcut({
        inChatPane: true,
        inFindBar: true,
        inEditable: true,
        isDocumentRoot: false,
      }),
    ).toBe(true);
  });
});
