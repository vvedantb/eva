import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const webSrc = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(webSrc, "..", "..", "..", "packages", "ui", "src");

const css = readFileSync(join(webSrc, "globals.css"), "utf8").replaceAll(
  "\r\n",
  "\n",
);
/** Comments name the very classes these rules ban, so they have to go first. */
const cssRules = stripComments(css);
const tailwindConfig = stripComments(
  readFileSync(join(webSrc, "..", "tailwind.config.js"), "utf8"),
);

/**
 * The same property-name trap as the utilities below, in its other shape.
 *
 * An arbitrary `transition-[a,b]` emits exactly the properties it names, so
 * `transition-[transform,background-color]` on an element whose press is
 * `active:scale-[0.96]` transitions nothing: Tailwind sets the individual
 * `scale` property and the list only claimed `transform`. Thirteen call sites
 * had it — the card kebab on seven card surfaces, both split Run buttons, the
 * preview pane tabs, the kanban card's grab feedback, the sidebar hover nudges,
 * the team avatars, and the gantt resize handle whose own comment explains it
 * chose `translate` over `left`/`right` to stay on the compositor and then never
 * moved. Every one read as tokenised and animated nothing.
 *
 * Tailwind's own `transition-transform` is safe — it expands to
 * `transform, translate, scale, rotate` — so this only bites hand-written lists,
 * and it bites them silently.
 */
describe("arbitrary transition lists name the properties Tailwind sets", () => {
  const individual = ["scale", "translate", "rotate"] as const;

  /** Every `transition-[…]` in a source file, with the file it came from. */
  const lists = sourceFiles().flatMap((path) => {
    const source = stripComments(readFileSync(path, "utf8"));
    return [...source.matchAll(/transition-\[([^\]]+)\]/g)].map(
      ({ 1: properties }) => ({
        file: path.slice(path.indexOf("/src/") + 1),
        properties,
      }),
    );
  });

  /** Guards the regex above: a typo here would pass the rule vacuously. */
  it("finds the lists to check", () => {
    expect(lists.length).toBeGreaterThan(20);
  });

  /**
   * `transform` alone is the tell. It is legitimate *next to* an individual
   * property, because a hand-written `transform:` can be animated at the same
   * time — the kanban card transitions dnd-kit's inline `transform` and its own
   * `scale`. So the rule is "name an individual property too", not "never say
   * transform".
   */
  it("no list names `transform` without an individual transform property", () => {
    const offenders = lists.filter(
      ({ properties }) =>
        /\btransform\b/.test(properties) &&
        !individual.some((property) =>
          new RegExp(`\\b${property}\\b`).test(properties),
        ),
    );
    expect(
      offenders,
      "`transform` does not match the scale/translate/rotate properties Tailwind's utilities set",
    ).toEqual([]);
  });
});

/**
 * Tailwind v4 compiles `scale-[0.98]` to `scale: 0.98` and `translate-x-*` to
 * `translate: …` — the individual transform properties from Transforms Level 2,
 * not a `transform: scale(…)` shorthand. `transition-property` matches property
 * names literally, so a utility listing only `transform` transitions a property
 * these call sites leave at `none` for ever, while the press or the travel
 * changes an untransitioned one and lands in a single frame.
 *
 * That is how the house press shipped inert across every button, tab, select,
 * checkbox, list row and menu item at once, and how `t-switch-thumb` came to
 * carry a comment about the knob decelerating into the far wall while the knob
 * actually teleported. Nothing looks broken when this regresses — the control
 * still presses, the switch still toggles — so it wants a test rather than an
 * eye. Listing `transform` as well is harmless and covers hand-written
 * `transform:` values.
 */
describe("motion utilities transition the properties Tailwind actually sets", () => {
  const individualTransforms = ["scale", "translate", "rotate"] as const;

  /** `@utility <name> { … }` bodies, which is where the house curves live. */
  const utilities = [...cssRules.matchAll(/@utility\s+([\w-]+)\s*\{/g)].flatMap(
    ({ 1: name, index }) => {
      const body = cssRules.slice(index, cssRules.indexOf("\n}", index));
      const declared = /transition-property:([^;]+);/.exec(body);
      return declared ? [{ name, properties: declared[1] }] : [];
    },
  );

  it("finds the utilities to check", () => {
    expect(utilities.map((utility) => utility.name)).toEqual(
      expect.arrayContaining([
        "motion-base",
        "motion-emphasized",
        "motion-press",
        "t-switch-thumb",
      ]),
    );
  });

  it.each(utilities.filter((utility) => /\btransform\b/.test(utility.properties)))(
    "$name lists the individual transform properties, not just `transform`",
    ({ properties }) => {
      /**
       * `t-switch-thumb` only ever moves, so it is not required to list `scale`
       * — but whichever of the three a utility omits, omitting *all* of them
       * means the Tailwind utilities it was written for cannot animate.
       */
      expect(
        individualTransforms.filter((property) =>
          new RegExp(`\\b${property}\\b`).test(properties),
        ),
        "Tailwind's scale/translate/rotate utilities set these properties; `transform` alone never matches them",
      ).not.toEqual([]);
    },
  );

  /**
   * Per-property `transition-duration` lists are positional: one more property
   * than durations and the list restarts, silently handing a later property the
   * first property's duration. `motion-press` is the one that carries a list.
   */
  it.each(utilities.filter((utility) => utility.properties.includes(",")))(
    "$name has one duration per property, or a single duration for all",
    ({ name, properties }) => {
      const body = cssRules.slice(
        cssRules.indexOf(`@utility ${name} {`),
        cssRules.indexOf("\n}", cssRules.indexOf(`@utility ${name} {`)),
      );
      const durations = /transition-duration:([^;]+);/.exec(body);
      if (!durations) return;
      const count = (list: string) => list.split(",").length;
      if (count(durations[1]) === 1) return;
      expect(count(durations[1]), "positional list is out of step").toBe(
        count(properties),
      );
    },
  );

});

/**
 * 184 call sites write a bare `transition-colors` / `transition-transform` and
 * never reach for a token, so the house curve has to be the *default* rather
 * than something each site opts into (fix 27a36884). Tailwind's own defaults
 * are 150ms and `cubic-bezier(0.4, 0, 0.2, 1)` — close enough to look right and
 * wrong enough to read as two different systems side by side.
 */
describe("the default transition is the house one", () => {
  it("points the two Tailwind defaults at the motion tokens", () => {
    expect(cssRules).toMatch(
      /--default-transition-duration:\s*var\(--motion-fast\)/,
    );
    expect(cssRules).toMatch(
      /--default-transition-timing-function:\s*var\(--motion-ease-out\)/,
    );
  });

  /**
   * The trap this exists to hold shut. Overriding either default through the v3
   * config makes Tailwind v4 drop its own `--default-transition-*` definitions
   * from the sheet while still emitting the `var()` references to them, so every
   * bare `transition-*` in the app falls back to `0s` and simply stops
   * animating. Nothing errors, and the config edit looks like the tidier of the
   * two places to make the change — which is exactly why it gets tried again.
   */
  it.each(["transitionDuration", "transitionTimingFunction"])(
    "does not override %s in the Tailwind config",
    (key) => {
      expect(
        tailwindConfig,
        `${key}.DEFAULT here collapses every bare transition to 0s — set it in globals.css`,
      ).not.toMatch(new RegExp(`${key}\\s*:\\s*\\{`));
    },
  );

  /**
   * `tailwindcss-animate` registers its own `ease` namespace, and for an
   * arbitrary value its rule is the only one emitted — so `ease-(--motion-ease-out)`
   * sets `animation-timing-function` and never touches the transition it was
   * written for. It reads as tokenised and does nothing (fix 88ad508e). The
   * default above is already that curve.
   */
  it("has no arbitrary ease utility pointing at a motion token", () => {
    const offenders = sourceFiles().filter((path) =>
      /ease-(?:\(|\[var\()--motion/.test(
        stripComments(readFileSync(path, "utf8")),
      ),
    );
    expect(
      offenders,
      "an arbitrary ease- value only sets animation-timing-function",
    ).toEqual([]);
  });
});

/**
 * Two dozen controls across the app are hidden at `opacity-0` and revealed by
 * `group-hover:opacity-100` — row actions, tab close buttons, sidebar
 * affordances. On a device with no hover they cannot be revealed at all, so on
 * a phone they are not hidden, they are absent (fix c6d74b1d). One rule covers
 * every call site.
 */
describe("hover-only controls are reachable without hover", () => {
  const revealAt = cssRules.indexOf("@media (hover: none)");

  it("reveals the group-hover opacity utility when hover is unavailable", () => {
    expect(revealAt, "the touch reveal rule is gone").toBeGreaterThan(-1);
    const block = cssRules.slice(revealAt, cssRules.indexOf("\n}", revealAt));
    expect(block).toContain(".group-hover\\:opacity-100");
    expect(block).toMatch(/opacity:\s*1/);
  });

  /**
   * `.opacity-0` lives in `@layer utilities` and both selectors are a single
   * class, so a layered rule ties on specificity and loses to whichever comes
   * later — the reveal silently stops working. Unlayered CSS beats every layer,
   * which is the only reason this rule wins.
   */
  it("keeps the rule outside every cascade layer", () => {
    expect(
      enclosingBlocks(cssRules, revealAt).filter((prelude) =>
        prelude.startsWith("@layer"),
      ),
      "a layered rule ties with .opacity-0 on specificity and loses",
    ).toEqual([]);
  });
});

/**
 * Four bars and indicators animated a geometry property — two progress bars and
 * the projects timeline bar on `width`, the model picker's selection indicator
 * on `top` — so the browser relayouted the row on every frame of an animation
 * that runs while the user is still moving (fixes 88ad508e, faa1e251). Each now
 * paints at full size and moves with `transform`.
 *
 * Nothing looks broken when this regresses: the bar still fills, it just janks
 * on the machines least able to afford it, which is why it wants a test rather
 * than an eye.
 */
describe("bars animate transform, not geometry", () => {
  const bars = [
    { file: "ui/progress.tsx", root: uiSrc, transform: "translateX(" },
    { file: "ai-elements/test-results.tsx", root: uiSrc, transform: "scaleX(" },
    {
      file: "ai-elements/model-picker-content.tsx",
      root: uiSrc,
      transform: "translateY(",
    },
    {
      file: "lib/components/projects/_components/TimelineBar.tsx",
      root: webSrc,
      transform: "scaleX(",
    },
  ];

  it.each(bars)("$file moves with $transform", ({ file, root, transform }) => {
    const source = stripComments(readFileSync(join(root, file), "utf8"));
    expect(source).toContain(transform);
    expect(source).toContain("transition-transform");
    expect(
      source,
      "transitioning a geometry property relayouts every frame",
    ).not.toMatch(/transition-\[[^\]]*\b(?:width|height|top|left)\b/);
    expect(
      source,
      "size or offset it once in CSS, then move it with transform",
    ).not.toMatch(/style=\{\{[^}]*\b(?:width|height|top|left)\s*:/);
  });

  /**
   * The scaled layers are anchored, not centred: without `origin-left` a
   * `scaleX` bar grows from its middle in both directions and reads as a
   * loading shimmer rather than a fill.
   */
  it.each(bars.filter((bar) => bar.transform === "scaleX("))(
    "$file scales from the left edge",
    ({ file, root }) => {
      expect(stripComments(readFileSync(join(root, file), "utf8"))).toContain(
        "origin-left",
      );
    },
  );

  /**
   * The diffs toolbar's bar was a hand-rolled duplicate of `Progress` that
   * animated `width`. The bar is gone; a width-animated one must not return.
   */
  it("the diffs toolbar does not hand-roll a width-animated bar", () => {
    const source = stripComments(
      readFileSync(
        join(webSrc, "lib/components/sandbox/DiffsToolbar.tsx"),
        "utf8",
      ),
    );
    expect(source).not.toMatch(/style=\{\{[^}]*\bwidth\s*:/);
  });
});

/** The preludes of the blocks open at `index`, outermost first. */
function enclosingBlocks(source: string, index: number): string[] {
  const stack: string[] = [];
  let preludeStart = 0;
  for (let at = 0; at < index; at++) {
    const char = source[at];
    if (char === "{") {
      stack.push(source.slice(preludeStart, at).trim());
      preludeStart = at + 1;
    } else if (char === "}") {
      stack.pop();
      preludeStart = at + 1;
    } else if (char === ";") {
      preludeStart = at + 1;
    }
  }
  return stack;
}

/** Every hand-written component source that can carry a class name. */
function sourceFiles(): string[] {
  return [webSrc, uiSrc].flatMap((root) =>
    readdirSync(root, { recursive: true })
      .map((entry) => join(root, String(entry)))
      .filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".d.ts")),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
