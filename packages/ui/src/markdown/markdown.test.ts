import { describe, expect, it } from "vitest";

import { parseFenceTitle } from "./codeFence";
import { buildCodeLines, highlightSource } from "./codeHighlight";
import { looksLikeFilePath } from "./MarkdownInlineCode";
import { rehypeGithubAlerts } from "./rehypeGithubAlerts";

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, string>;
  children?: Node[];
};

const text = (value: string): Node => ({ type: "text", value });
const el = (tagName: string, children: Node[]): Node => ({
  type: "element",
  tagName,
  properties: {},
  children,
});

function alert(quote: Node): Node {
  const root: Node = { type: "root", children: [quote] };
  rehypeGithubAlerts()(root);
  return quote;
}

describe("rehypeGithubAlerts", () => {
  it("tags a marker on its own line and strips it", () => {
    const quote = alert(
      el("blockquote", [text("\n"), el("p", [text("[!WARNING]\nMind the gap")])]),
    );
    expect(quote.properties?.dataAlert).toBe("warning");
    expect(quote.children?.[1]?.children).toEqual([text("Mind the gap")]);
  });

  it("handles the hard break remark-breaks leaves after the marker", () => {
    const quote = alert(
      el("blockquote", [el("p", [text("[!tip]"), el("br", []), text("\nUse it")])]),
    );
    expect(quote.properties?.dataAlert).toBe("tip");
    expect(quote.children?.[0]?.children).toEqual([text("Use it")]);
  });

  it("drops the paragraph when the marker was all it held", () => {
    const quote = alert(
      el("blockquote", [el("p", [text("[!NOTE]")]), el("p", [text("Body")])]),
    );
    expect(quote.properties?.dataAlert).toBe("note");
    expect(quote.children).toHaveLength(1);
  });

  it("leaves `[!NOTE] inline` and unknown kinds as quotes, like GitHub", () => {
    expect(alert(el("blockquote", [el("p", [text("[!NOTE] aside")])])).properties).toEqual({});
    expect(alert(el("blockquote", [el("p", [text("[!DANGER]\nx")])])).properties).toEqual({});
  });
});

describe("parseFenceTitle", () => {
  it.each([
    ['title="src/app.ts"', "src/app.ts"],
    ["file=a.py {1-3}", "a.py"],
    ["filename='x y.md'", "x y.md"],
    ["src/index.tsx", "src/index.tsx"],
    ["{1,3}", null],
    ["1.5", null],
    ["", null],
  ])("%s → %s", (meta, expected) => {
    expect(parseFenceTitle(meta)).toBe(expected);
  });
});

describe("looksLikeFilePath", () => {
  it.each(["src/a.ts", "./x/y.md", "~/z.json", "/abs/p.rs:12:4", "package.json", "App.tsx:40"])(
    "%s is a file",
    (value) => expect(looksLikeFilePath(value)).toBe(true),
  );
  it.each(["console.log", "ctx.db", "v1.2.3", "https://x.io/a.ts", "a b.ts", "useState"])(
    "%s is not",
    (value) => expect(looksLikeFilePath(value)).toBe(false),
  );
});

describe("highlightSource", () => {
  it("highlights a finished block whole, minus trailing newlines", () => {
    expect(highlightSource("a\nb\n\n", false)).toBe("a\nb");
  });
  it("highlights a streaming block up to its last complete line", () => {
    expect(highlightSource("a\nb\npar", true)).toBe("a\nb");
    expect(highlightSource("partial", true)).toBe("");
  });
});

describe("buildCodeLines", () => {
  const token = (content: string) => ({ content });
  const result = { tokens: [[token("a")], [token("b")]] };

  it("uses tokens for highlighted lines and plain text past them", () => {
    const lines = buildCodeLines("a\nb\nc", { source: "a\nb", result });
    expect(lines.map((line) => line.tokens !== null)).toEqual([true, true, false]);
    expect(lines[2]?.text).toBe("c");
  });

  it("ignores a highlight that is not a line-aligned prefix", () => {
    expect(buildCodeLines("ab\nc", { source: "a", result }).every((line) => line.tokens === null)).toBe(true);
    expect(buildCodeLines("x\ny", { source: "a\nb", result }).every((line) => line.tokens === null)).toBe(true);
  });
});
