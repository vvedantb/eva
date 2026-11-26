import { describe, expect, it } from "bun:test";
import { titleFromPrompt } from "@eva/shared";

describe("titleFromPrompt", () => {
  it("takes the first non-empty line, trimmed", () => {
    expect(titleFromPrompt("\n\n  Fix the login bug  \nIt fails on Safari.")).toBe(
      "Fix the login bug",
    );
  });

  it("shows mention and skill tokens as their text", () => {
    expect(
      titleFromPrompt("Ask @[Ada Lovelace](k17abcdefghijklmnop) to /[Review](k17abcdefghijklmnoq) it"),
    ).toBe("Ask @Ada Lovelace to /Review it");
  });

  it("strips markdown", () => {
    expect(titleFromPrompt("## **Add** a `--dry-run` [flag](https://x.dev)")).toBe(
      "Add a --dry-run flag",
    );
    expect(titleFromPrompt("- [ ] Ship the docs")).toBe("Ship the docs");
  });

  it("cuts a long line on a word boundary", () => {
    const title = titleFromPrompt(
      "Move every settings page onto the new form layout so the spacing matches the design",
    );
    expect(title).toBe("Move every settings page onto the new form layout so the…");
  });

  it("cuts one very long word at the limit", () => {
    expect(titleFromPrompt("x".repeat(80))).toBe(`${"x".repeat(60)}…`);
  });

  it("is empty for an empty prompt", () => {
    expect(titleFromPrompt("  \n ")).toBe("");
  });
});
