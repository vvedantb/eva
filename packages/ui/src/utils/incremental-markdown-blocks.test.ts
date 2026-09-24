import { describe, expect, it, beforeEach } from "vitest";
import { parseMarkdownIntoBlocks } from "streamdown";
import {
  parseMarkdownIntoBlocksIncremental,
  resetIncrementalMarkdownBlocks,
} from "./incremental-markdown-blocks";

/**
 * The whole point of the incremental split is that it is indistinguishable
 * from the full one. These replay a reply the way a stream delivers it and
 * assert equality at every prefix, so any divergence shows up as the exact
 * character where the two parsers disagree.
 */
const DOCUMENTS: Record<string, string> = {
  prose: [
    "# Heading",
    "",
    "First paragraph with **bold** and `code`.",
    "",
    "Second paragraph.",
    "",
  ].join("\n"),

  lists: [
    "Intro line.",
    "",
    "- one",
    "- two",
    "  - nested",
    "",
    "1. first",
    "2. second",
    "",
    "Trailing prose.",
    "",
  ].join("\n"),

  codeFences: [
    "Here is the fix:",
    "",
    "```ts",
    "const a = 1;",
    "const b = 2;",
    "```",
    "",
    "And another:",
    "",
    "```bash",
    "pnpm test",
    "```",
    "",
  ].join("\n"),

  // A setext underline is only a heading because of the paragraph directly
  // above it: the case a naive tail re-lex would turn into a thematic break.
  setext: ["Title", "=====", "", "Body.", "", "Subtitle", "--------", ""].join(
    "\n",
  ),

  // Tight blocks with no blank line between them: no clean boundary exists,
  // so every prefix must fall back to a full parse and still match.
  tight: ["para", "- a", "- b", "> quote", "para2", ""].join("\n"),

  table: [
    "Results:",
    "",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    "| 3 | 4 |",
    "",
    "Done.",
    "",
  ].join("\n"),

  html: [
    "Before.",
    "",
    "<div>",
    "",
    "inside the div",
    "",
    "</div>",
    "",
    "After.",
    "",
  ].join("\n"),

  footnotes: [
    "Claim with a note[^1].",
    "",
    "More prose.",
    "",
    "[^1]: The note body.",
    "",
  ].join("\n"),
};

describe("parseMarkdownIntoBlocksIncremental", () => {
  beforeEach(() => {
    resetIncrementalMarkdownBlocks();
  });

  for (const [name, document] of Object.entries(DOCUMENTS)) {
    it(`matches a full parse at every streamed prefix (${name})`, () => {
      for (let end = 1; end <= document.length; end++) {
        const prefix = document.slice(0, end);
        expect(parseMarkdownIntoBlocksIncremental(prefix)).toEqual(
          parseMarkdownIntoBlocks(prefix),
        );
      }
    });
  }

  it("matches a full parse when several documents stream interleaved", () => {
    const [a, b] = [DOCUMENTS.prose ?? "", DOCUMENTS.codeFences ?? ""];
    const longest = Math.max(a.length, b.length);
    for (let end = 1; end <= longest; end++) {
      for (const document of [a, b]) {
        const prefix = document.slice(0, Math.min(end, document.length));
        expect(parseMarkdownIntoBlocksIncremental(prefix)).toEqual(
          parseMarkdownIntoBlocks(prefix),
        );
      }
    }
  });

  it("matches a full parse when the tail is rewritten, not appended", () => {
    // Streamdown completes an open fence before splitting, so the string this
    // function sees can shrink or change at the end between ticks.
    const base = "Intro.\n\n```ts\nconst a = 1;\n";
    for (const completion of ["```", "\nconst b = 2;\n```", "", "\n```"]) {
      const source = base + completion;
      expect(parseMarkdownIntoBlocksIncremental(source)).toEqual(
        parseMarkdownIntoBlocks(source),
      );
    }
  });

  it("returns the cached array for a repeated call", () => {
    const source = DOCUMENTS.prose ?? "";
    expect(parseMarkdownIntoBlocksIncremental(source)).toBe(
      parseMarkdownIntoBlocksIncremental(source),
    );
  });
});
