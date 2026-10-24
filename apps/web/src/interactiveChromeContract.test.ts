import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webSrc = dirname(fileURLToPath(import.meta.url));
// eva's classes for the shared @vvedantb/ui primitives (its UiConfig).
const uiPrimitives = join(webSrc, "..", "..", "..", "packages", "ui", "src", "config");

/** Comments below name the very declarations these rules ban, so they go first. */
const css = stripComments(
  readFileSync(join(webSrc, "globals.css"), "utf8").replaceAll("\r\n", "\n"),
);

function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

/** A top-level `@utility <name> { … }` block, up to its closing brace. */
function utility(name: string): string {
  const startAt = css.indexOf(`@utility ${name} {`);
  expect(startAt, `the ${name} utility is gone`).toBeGreaterThan(-1);
  const endAt = css.indexOf("\n}", startAt);
  expect(endAt, `the ${name} utility is unterminated`).toBeGreaterThan(startAt);
  return css.slice(startAt, endAt);
}

/**
 * Chrome treats every `overflow: auto` element as a scroll container even when
 * it has nothing to scroll, so a blanket `overscroll-behavior: contain` on the
 * shared `.scrollbar` utility created wheel dead-zones across the app: nested
 * panes and horizontal boards (`overflow-y-hidden`) swallowed vertical wheel
 * while dragging the scrollbar still worked, which is why it read as "some
 * areas just don't scroll" rather than a CSS bug (fix 20bcbd1f0).
 *
 * `.scrollbar` is worn by most scroll areas in the app, so the blast radius of
 * putting containment back here is the whole product.
 */
describe("the scrollbar utility", () => {
  it("styles the scrollbar without claiming the wheel", () => {
    const block = utility("scrollbar");
    expect(block).toContain("scrollbar-width: thin");
    expect(
      block,
      "overscroll-behavior on .scrollbar eats mouse wheel in panes with no " +
        "overflow — opt in per pane with overscroll-y-contain instead",
    ).not.toMatch(/overscroll-behavior/);
  });

  it("scrollbar-thin inherits that, rather than redeclaring it", () => {
    const block = utility("scrollbar-thin");
    expect(block).toContain("@apply scrollbar");
    expect(block).not.toMatch(/overscroll-behavior/);
  });

  it("scrollbar-none only hides chrome, keeping the element scrollable", () => {
    const block = utility("scrollbar-none");
    expect(block).toContain("scrollbar-width: none");
    expect(block).not.toMatch(/overscroll-behavior/);
    // `overflow: hidden` here would stop wheel and drag-to-pan outright.
    expect(block).not.toMatch(/overflow:\s*hidden/);
  });
});

/**
 * Tailwind v4's preflight dropped `cursor: pointer` on buttons to match UA
 * defaults, so the hand disappeared from every control that had not spelled
 * out `cursor-pointer` — across the whole app at once (fix 6843d7d39). The
 * base rule is the one place this is fixed; per-component `cursor-pointer` is
 * what it exists to make unnecessary.
 */
describe("the interactive cursor base rule", () => {
  const rule = (() => {
    const at = css.indexOf("button:not(:disabled)");
    expect(at, "the interactive cursor rule is gone from globals.css").toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  })();

  it("gives clickable controls the hand", () => {
    expect(rule).toMatch(/cursor:\s*pointer/);
  });

  /**
   * Radix renders most of its interactive parts as divs with a role, so a
   * `button`-only rule leaves menus, listboxes and tabs on the arrow.
   */
  it.each([
    "button",
    "option",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "tab",
    "checkbox",
    "radio",
    "switch",
    "combobox",
  ])('covers [role="%s"]', (role) => {
    const selector = role === "button" ? "button:not(:disabled)" : `[role="${role}"]`;
    expect(rule).toContain(selector);
  });

  it("shows disabled controls as not-allowed", () => {
    const at = css.indexOf("button:disabled");
    expect(at, "the disabled cursor rule is gone").toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toMatch(/cursor:\s*not-allowed/);
  });

  /**
   * The other half of the same regression: primitives that had papered over
   * the missing base rule with `cursor-default` kept the arrow once the rule
   * came back, since the class wins on specificity. Decorative app-level
   * elements (badges, timestamps) may still use it — shared primitives under
   * eva's @vvedantb/ui config (packages/ui/src/config) are controls, so they
   * may not.
   */
  it("is not overridden inside the shared UI primitives", () => {
    const offenders = readdirSync(uiPrimitives, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) =>
        readFileSync(join(uiPrimitives, file), "utf8").includes("cursor-default"),
      );
    expect(
      offenders,
      "cursor-default on a shared primitive beats the base rule and takes " +
        "the hand off every control built from it",
    ).toEqual([]);
  });
});
