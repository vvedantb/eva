import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression (PR #1041): the @vvedantb/ui `filled24` toast icons set
 * `fill="none"` on the SVG and rely on the `fill-current` utility. When that
 * utility lost in the cascade, every success / error / warning / info toast
 * showed a blank 24px icon slot. globals.css paints them with an unlayered
 * `fill: currentColor` rule; this test keeps that rule in place for as long as
 * the package icons still need it.
 */

const here = dirname(fileURLToPath(import.meta.url));

const stripComments = (css: string) => css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

const globalsCss = stripComments(
  readFileSync(join(here, "globals.css"), "utf8"),
);
const iconsSource = readFileSync(
  join(here, "..", "node_modules", "@vvedantb", "ui", "src", "ui", "sonner-icons.tsx"),
  "utf8",
);
const foundationsSource = readFileSync(
  join(here, "..", "..", "..", "packages", "ui", "src", "config", "foundations.ts"),
  "utf8",
);

const statusIcons = [
  { type: "success", component: "SuccessIcon" },
  { type: "error", component: "ErrorIcon" },
  { type: "warning", component: "WarningIcon" },
  { type: "info", component: "InfoIcon" },
];

/** The opening `<svg …>` tag that the package icon component renders. */
function svgOpenTag(component: string): string {
  const body = iconsSource.slice(iconsSource.indexOf(`function ${component}()`));
  const match = /<svg\b[^>]*>/.exec(body);
  expect(match, `${component} no longer renders an <svg>`).not.toBeNull();
  return match?.[0] ?? "";
}

/** Brace depth at `index`: 0 means the rule sits outside every `@layer` / at-rule. */
function braceDepthAt(css: string, index: number): number {
  let depth = 0;
  for (const char of css.slice(0, index)) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
  }
  return depth;
}

/** The declaration block of the first rule whose selector list holds `selector`. */
function ruleFor(selector: string): { depth: number; body: string } | null {
  const index = globalsCss.indexOf(selector);
  if (index === -1) return null;
  const open = globalsCss.indexOf("{", index);
  const close = globalsCss.indexOf("}", open);
  return {
    depth: braceDepthAt(globalsCss, index),
    body: globalsCss.slice(open + 1, close),
  };
}

const usesFilled24 = /toastIcons:\s*"filled24"/.test(foundationsSource);

describe("toast status icons stay painted", () => {
  it.each(statusIcons)(
    "$type toast icon has a fill that paints",
    ({ type, component }) => {
      if (!usesFilled24) return;
      const svg = svgOpenTag(component);
      if (!svg.includes('fill="none"')) return;

      const selector = `[data-sonner-toast][data-type="${type}"] [data-icon] svg`;
      const rule = ruleFor(selector);
      expect(
        rule,
        `${component} ships fill="none"; globals.css needs \`${selector} { fill: currentColor }\``,
      ).not.toBeNull();
      expect(
        rule?.depth,
        "the override must be unlayered so it beats layered utilities",
      ).toBe(0);
      expect(rule?.body).toMatch(/fill:\s*currentColor\s*;/);
    },
  );
});
