import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webSrc = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(webSrc, "..", "..", "..", "packages", "ui", "src");

/** Comments name classes and queries these rules ban, so they have to go first. */
const cssRules = stripComments(
  readFileSync(join(webSrc, "globals.css"), "utf8").replaceAll("\r\n", "\n"),
);
const tailwindConfig = stripComments(
  readFileSync(join(webSrc, "..", "tailwind.config.js"), "utf8"),
);

/** Every `@keyframes` in the sheet, plus any `--animate-*` theme entry. */
const definedAnimations = new Set([
  ...[...cssRules.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map(
    (match) => match[1],
  ),
  ...[...cssRules.matchAll(/--animate-([A-Za-z0-9_-]+)\s*:/g)].map(
    (match) => match[1],
  ),
]);

/**
 * An `animation` shorthand naming keyframes that do not exist is not an error
 * anywhere in the toolchain — the declaration is simply dropped and the element
 * snaps. That is exactly how `animate-accordion-up` / `-down` survived for
 * months against eight accordion surfaces (fix e8ec18cf) and how all 56
 * collapsible panels went unanimated (fix dc65dc69): the classes read as
 * animated, and only the eye could tell they were not.
 *
 * These two rules close both halves of that gap — a name written in CSS, and a
 * name written as a utility class.
 */
describe("every animation that is referenced exists", () => {
  it("resolves every animation named in the stylesheet", () => {
    const unresolved = [...cssRules.matchAll(/animation(?:-name)?\s*:([^;]+);/g)]
      .flatMap((match) => (match[1] ?? "").split(","))
      .map(animationName)
      .filter((name): name is string => name !== undefined)
      .filter((name) => !definedAnimations.has(name));
    expect(
      [...new Set(unresolved)],
      "an undefined animation name is dropped silently and the element snaps",
    ).toEqual([]);
  });

  it("resolves every animate-* utility used in a component", () => {
    const unresolved = sourceFiles().flatMap((path) => {
      const used = [
        ...stripComments(readFileSync(path, "utf8")).matchAll(
          /\banimate-([a-z][a-zA-Z0-9_-]*)/g,
        ),
      ].map((match) => match[1] ?? "");
      return used
        .filter(
          (name) =>
            !BUILT_IN_ANIMATIONS.has(name) && !definedAnimations.has(name),
        )
        .map((name) => `${name} (${path})`);
    });
    expect(
      [...new Set(unresolved)],
      "define the keyframes in globals.css, or the class does nothing",
    ).toEqual([]);
  });

  /**
   * `animate-in` / `animate-out` are the plugin's, not Tailwind's, and 43 call
   * sites depend on them — every menu, dialog and popover. Dropping the plugin
   * would strip all of that motion at once while leaving the classes in place.
   */
  it("still registers the plugin the enter/exit utilities come from", () => {
    expect(tailwindConfig).toMatch(
      /plugins:\s*\[[^\]]*\btailwindcssAnimate\b/,
    );
  });
});

/**
 * Both primitives shipped as bare Radix re-exports, which animate nothing. The
 * wrappers are what makes a panel move, so each one has to keep carrying its
 * utility — and the utility has to drive Radix's *measured* height var, since a
 * keyframe to `auto` or to a fixed height cannot animate a panel open.
 */
describe("measured-height panels", () => {
  const panels = [
    {
      name: "accordion",
      file: "ui/accordion.tsx",
      utility: "t-accordion-content",
      heightVar: "--radix-accordion-content-height",
    },
    {
      name: "collapsible",
      file: "ui/collapsible.tsx",
      utility: "t-collapsible-content",
      heightVar: "--radix-collapsible-content-height",
    },
  ];

  it.each(panels)("the $name content carries $utility", ({ file, utility }) => {
    const source = stripComments(readFileSync(join(uiSrc, file), "utf8"));
    expect(
      source,
      "a bare Radix re-export snaps open — wrap it",
    ).toContain(utility);
  });

  it.each(panels)("$utility animates open and closed", ({ utility }) => {
    const block = utilityBlock(utility);
    for (const state of ["open", "closed"]) {
      const stateAt = block.indexOf(`&[data-state="${state}"]`);
      expect(
        stateAt,
        `${utility} does not animate on data-state="${state}"`,
      ).toBeGreaterThan(-1);
      expect(block.slice(stateAt, block.indexOf("}", stateAt))).toMatch(
        /animation:\s*\S/,
      );
    }
  });

  it.each(panels)(
    "the $name keyframes travel to $heightVar",
    ({ heightVar }) => {
      const travelling = [...definedAnimations]
        .map((name) => keyframesBody(name))
        .filter((body) => body.includes(heightVar));
      // One down, one up — the same path in both directions.
      expect(travelling).toHaveLength(2);
      for (const body of travelling) {
        expect(
          body,
          "a panel has to open from zero height, not from a guess",
        ).toMatch(/height:\s*0/);
      }
    },
  );
});

/**
 * Recorded as a do-not-reintroduce in globals.css and docs/eva-ui.md. Fix
 * dc65dc69 removed three media blocks and seven `useReducedMotion` gates
 * because the gated paths were a second set of variants nobody exercised, and
 * they had already drifted. Re-adding one gate looks like an accessibility
 * improvement, which is why this needs to be mechanical rather than a comment.
 */
describe("infinite animations pause when the user cannot see them", () => {
  it("pauses beams, shimmers and spins on a hidden tab", () => {
    expect(cssRules).toContain("html[data-page-hidden]");
    expect(cssRules).toContain("animation-play-state: paused");
    expect(cssRules).toContain("[data-anim-offscreen]");
    expect(cssRules).toContain("[aria-hidden=\"true\"] .beam::before");
    expect(cssRules).toContain("[aria-hidden=\"true\"] .animate-pulse");
    expect(cssRules).toContain("[data-anim-offscreen] .animate-pulse");
    expect(cssRules).toContain(".shimmer-text");
    expect(cssRules).toContain(".landing-pulse-dot");
  });

});

/**
 * Recorded as a do-not-reintroduce in CLAUDE.md, AGENTS.md, docs/eva-ui.md,
 * and globals.css. A live blur on the spinning beam was the leftover GPU
 * floor; do not put it back.
 */
describe("beam halo blur is banned", () => {
  it("does not mount a halo or blur the beam", () => {
    expect(cssRules).not.toMatch(
      /\.beam[\w-]*(?:::[a-z-]+)?\s*\{[^}]*filter:\s*(?:blur|drop-shadow)/,
    );
    expect(cssRules).not.toContain("beam-halo");
    const beam = readFileSync(join(uiSrc, "ui", "border-beam.tsx"), "utf8");
    expect(beam).not.toContain("beam-halo");
    expect(beam).not.toContain("glow");
  });
});

describe("reduced motion is not gated for", () => {
  it("has no prefers-reduced-motion query in the stylesheet", () => {
    expect(cssRules).not.toContain("prefers-reduced-motion");
  });

  it("has no useReducedMotion gate in a component", () => {
    const offenders = sourceFiles().filter((path) =>
      /useReducedMotion|motion-reduce:/.test(
        stripComments(readFileSync(path, "utf8")),
      ),
    );
    expect(offenders, "see the note in globals.css").toEqual([]);
  });
});

/** Utilities Tailwind core and `tailwindcss-animate` define for us. */
const BUILT_IN_ANIMATIONS = new Set([
  "spin",
  "ping",
  "pulse",
  "bounce",
  "none",
  "in",
  "out",
]);

/** Longhand keywords that can sit where the animation name does. */
const ANIMATION_KEYWORDS = new Set([
  "none",
  "infinite",
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
  "forwards",
  "backwards",
  "both",
  "running",
  "paused",
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
  "initial",
  "inherit",
  "unset",
  "revert",
]);

/** The keyframes name out of one comma-separated `animation` value. */
function animationName(value: string): string | undefined {
  return value
    .trim()
    .split(/\s+/)
    .find(
      (token) =>
        /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(token) &&
        !ANIMATION_KEYWORDS.has(token),
    );
}

/** The body of one `@keyframes` block, found by matching its braces. */
function keyframesBody(name: string): string {
  const declaredAt = cssRules.indexOf(`@keyframes ${name}`);
  if (declaredAt < 0) {
    return "";
  }
  const openAt = cssRules.indexOf("{", declaredAt);
  let depth = 0;
  for (let at = openAt; at < cssRules.length; at++) {
    if (cssRules[at] === "{") depth++;
    else if (cssRules[at] === "}" && --depth === 0) {
      return cssRules.slice(openAt + 1, at);
    }
  }
  return "";
}

/** `@utility <name> { … }`, up to the brace that closes it at column 0. */
function utilityBlock(name: string): string {
  const startAt = cssRules.indexOf(`@utility ${name} {`);
  expect(startAt, `the ${name} utility is gone`).toBeGreaterThan(-1);
  return cssRules.slice(startAt, cssRules.indexOf("\n}", startAt));
}

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
