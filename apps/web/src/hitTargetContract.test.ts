import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readAppStylesheet } from "./appStylesheet";

const webSrc = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(webSrc, "..", "..", "..", "packages", "ui", "src");

/** Comments here name the very declarations these rules ban, so they go first. */
const cssRules = stripComments(readAppStylesheet());

/** `@utility hit-target { … }`, up to the brace that closes it at column 0. */
function hitTargetUtility(): string {
  const startAt = cssRules.indexOf("@utility hit-target {");
  expect(startAt, "the hit-target utility is gone").toBeGreaterThan(-1);
  return cssRules.slice(startAt, cssRules.indexOf("\n}", startAt));
}

/**
 * Row-level controls were being hand-sized to `size-6`/`size-7` and left below
 * the comfortable-tap floor — PendingReviewCommentChips shipped a 20px remove
 * button with no padding at all — and six other sites hand-rolled the same
 * `after:absolute after:inset-[-8px]` the utility already provides (fix
 * c6d74b1d). The utility is the one place that geometry is allowed to live.
 */
describe("the hit-target utility", () => {
  it("expands the pressable area with a pseudo-element", () => {
    const utility = hitTargetUtility();
    const after = utility.slice(utility.indexOf("&::after"));
    expect(after).toMatch(/content:\s*""/);
    expect(after).toMatch(/position:\s*absolute/);
    // A positive inset would shrink the target rather than grow it.
    expect(after).toMatch(/inset:\s*-\d+px/);
  });

  /**
   * The trap this exists to hold shut. `.hit-target` and Tailwind's `.absolute`
   * are both a single class, so a blanket `position: relative` here wins purely
   * on source order and drops every absolutely-positioned control that carries
   * the utility — the sidebar's section chevron, `icon-xs` close buttons — out
   * of its corner and into flow. Nothing errors; the layout just breaks
   * somewhere far from this file. Skipping the guard is the tidier-looking
   * edit, which is exactly why it gets tried.
   */
  it("only forces `relative` on elements that are still static", () => {
    const utility = hitTargetUtility();
    const guardAt = utility.indexOf(
      "&:not(.absolute):not(.fixed):not(.sticky)",
    );
    expect(
      guardAt,
      "an unguarded `relative` overrides Tailwind `absolute`",
    ).toBeGreaterThan(-1);

    const relatives = [...utility.matchAll(/position:\s*relative/g)];
    expect(relatives, "one guarded `relative`, no more").toHaveLength(1);
    const relativeAt = relatives[0]?.index ?? -1;
    expect(relativeAt).toBeGreaterThan(guardAt);
    // Still inside the guard's own block, not merely after its selector.
    expect(relativeAt).toBeLessThan(utility.indexOf("&::after"));
  });
});

describe("the utility is what every call site uses", () => {
  const sources = sourceFiles().map(
    (path) => [path, stripComments(readFileSync(path, "utf8"))] as const,
  );

  /**
   * The guard above is only worth keeping while something depends on it. These
   * are the call sites that pair the utility with `absolute` and would silently
   * fall into flow if it went away — a drop here means the guard's justification
   * changed, not that the contract got easier.
   */
  it("has call sites that combine it with `absolute`", () => {
    const combined = sources.flatMap(([path, source]) =>
      [...source.matchAll(/"[^"\n]*"/g)]
        .map((match) => match[0])
        .filter(
          (literal) =>
            literal.includes("hit-target") && /\babsolute\b/.test(literal),
        )
        .map(() => path),
    );
    expect(combined.length).toBeGreaterThan(0);
  });

  /**
   * The six sites that drifted before. Anything wanting this exact geometry has
   * to take it from the utility, so the inset is tuned in one place — other
   * insets (`-6px`, `-7px`, `-10px`) are deliberate and left alone.
   */
  it("is not hand-rolled anywhere", () => {
    const handRolled = sources
      .filter(([, source]) => source.includes("after:inset-[-8px]"))
      .map(([path]) => path);
    expect(handRolled, "use `hit-target` instead").toEqual([]);
  });

  /** The two button sizes that fall under the tap floor carry it by default. */
  it.each(["xs", '"icon-xs"'])("is built into the %s button size", (key) => {
    // eva's config replaces vvedantb's Button sizes with `buttonSize`.
    const controls = stripComments(
      readFileSync(join(uiSrc, "config", "controls.ts"), "utf8"),
    );
    expect(controls, "Button no longer renders buttonSize").toContain(
      "size: buttonSize",
    );
    // Sliced to `buttonSize`: InputGroup's button sizes reuse the same keys.
    const button = controls.slice(
      controls.indexOf("const buttonSize = {"),
      controls.indexOf("\n};", controls.indexOf("const buttonSize = {")),
    );
    // `xs: "` cannot match inside `"icon-xs": "`, which quotes its key.
    const startAt = button.indexOf(`${key}: "`);
    expect(startAt, `the ${key} size moved or was renamed`).toBeGreaterThan(-1);
    expect(button.slice(startAt, button.indexOf("\n", startAt))).toContain(
      "hit-target",
    );
  });
});

/** Every hand-written component source that can carry a class name. */
function sourceFiles(): string[] {
  return [webSrc, uiSrc].flatMap((root) =>
    readdirSync(root, { recursive: true })
      .map((entry) => join(root, String(entry)))
      .filter((path) => path.endsWith(".tsx")),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
