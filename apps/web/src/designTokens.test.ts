import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const primitivesDir = join(
  here,
  "..",
  "..",
  "..",
  "packages",
  "ui",
  "src",
  "ui",
);

const globalsCss = readFileSync(join(here, "globals.css"), "utf8").replaceAll(
  "\r\n",
  "\n",
);

/** The `r g b` triple for a token inside the light theme's `:root` block. */
function lightToken(name: string): [number, number, number] {
  return themeToken(name, ":root {");
}

/** The `r g b` triple for a token inside the dark theme's `.dark` block. */
function darkToken(name: string): [number, number, number] {
  return themeToken(name, ".dark {");
}

function themeToken(name: string, selector: string): [number, number, number] {
  const block = globalsCss.slice(
    globalsCss.indexOf(selector, globalsCss.indexOf("@layer base")),
  );
  const match = new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`).exec(block);
  expect(match, `--${name} is not declared as an r g b triple`).not.toBeNull();
  const [, r, g, b] = match ?? [];
  return [Number(r), Number(g), Number(b)];
}

/** WCAG 2.x relative luminance for an 8-bit sRGB triple. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (lr ?? 0) + 0.7152 * (lg ?? 0) + 0.0722 * (lb ?? 0);
}

function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

describe("light theme contrast", () => {
  /**
   * Muted text carries timestamps, counts, empty-state captions and section
   * labels — it is body copy, not decoration, so it owes WCAG AA (4.5:1). The
   * previous `113 114 116` measured 4.41:1 on the `244 245 246` canvas: close
   * enough to look fine on a laptop and to fail on a projector or in sunlight.
   */
  it("keeps --muted-foreground readable on the canvas", () => {
    const ratio = contrastRatio(
      lightToken("muted-foreground"),
      lightToken("background"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * Tinted chips — Jev's scope verdict is the live one — pair a `-bg` wash with
   * a `-strong` text colour. `--warning` and `--destructive` themselves are
   * fills, not text: on their own tint they measure around 2:1.
   */
  it.each([
    ["warning-strong", "warning-bg"],
    ["destructive-strong", "destructive-bg"],
  ])("keeps --%s readable on --%s", (text, background) => {
    expect(
      contrastRatio(lightToken(text), lightToken(background)),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkToken(text), darkToken(background)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("primitive insets", () => {
  /**
   * `tailwind-merge` resolves conflicts within a variant group, never across
   * them. A primitive whose default padding is `p-5 md:p-6` therefore keeps the
   * `md:p-6` when a call site passes `p-3`, and the override half-applies: right
   * at the breakpoint where the extra room was supposed to help, the call site
   * loses control of its own inset.
   *
   * That shipped. `CardContent` defaulted to `p-5 pt-0 md:p-6 md:pt-0`, so
   * thirteen call sites passing `p-3` rendered `padding: 0 24px 24px` above
   * 768px — content flush to the card's top edge over a band of dead space,
   * while the source read as if the override had worked.
   *
   * A primitive that wants a responsive inset should expose it as a prop. A
   * call site that wants one can still write `p-3 md:p-6` and get exactly that.
   */
  it("keeps primitive padding defaults free of responsive variants", () => {
    const files = readdirSync(primitivesDir).filter((name) =>
      name.endsWith(".tsx"),
    );
    expect(files.length, "no primitives found").toBeGreaterThan(0);

    for (const name of files) {
      const source = readFileSync(join(primitivesDir, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(
        source,
        `${name} pairs a responsive padding with a default inset`,
      ).not.toMatch(/\b(?:sm|md|lg|xl|2xl):p[trblxy]?-/);
    }
  });
});
