import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

/**
 * The inline script in `index.html` paints the theme before React exists, from
 * the hint written by `lib/contexts/themeHint.ts`. It runs on every cold load
 * and in no test, which is how it came to disagree with the app: it repainted a
 * System user from the appearance stored last boot, so waking a laptop that had
 * switched to dark still flashed — and then stayed — light (e5ecaa85d,
 * 2026-09-16). "System" now means *ask the OS now*, and the stored appearance is
 * ignored for it.
 *
 * Executed rather than read: a regex over the script would pass on a version of
 * it that no longer adds the class.
 */

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "..", "index.html"), "utf8");

/** The inline script that resolves the appearance, extracted from the page. */
function themeScriptSource(): string {
  const bodies = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? "",
  );
  const themeScript = bodies.find((body) =>
    body.includes("prefers-color-scheme"),
  );
  expect(
    themeScript,
    "index.html has no inline script that resolves the appearance",
  ).toBeDefined();
  return themeScript ?? "";
}

interface PaintResult {
  /** Classes the script put on <html>. */
  classes: string[];
  /** The <meta name="theme-color"> value it left behind. */
  themeColor: string;
  /** CSS custom properties it set inline on <html>. */
  cssVars: Record<string, string>;
}

/** Runs the real inline script against a stubbed document and OS preference. */
function paint(options: {
  hint?: string;
  legacyTheme?: string;
  prefersDark?: boolean;
}): PaintResult {
  const store = new Map<string, string>();
  if (options.hint !== undefined) {
    store.set("eva-custom-theme-hint", options.hint);
  }
  if (options.legacyTheme !== undefined) {
    store.set("theme", options.legacyTheme);
  }
  const classes: string[] = [];
  const cssVars: Record<string, string> = {};
  const themeColorMeta = { content: "" };

  runInNewContext(themeScriptSource(), {
    localStorage: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    window: {
      matchMedia: (query: string) => ({
        matches:
          query.includes("prefers-color-scheme: dark") &&
          options.prefersDark === true,
      }),
    },
    document: {
      documentElement: {
        classList: {
          add: (name: string) => {
            classes.push(name);
          },
        },
        style: {
          setProperty: (name: string, value: string) => {
            cssVars[name] = value;
          },
        },
      },
      querySelector: (selector: string) =>
        selector.includes("theme-color") ? themeColorMeta : null,
      createElement: () => ({
        rel: "",
        href: "",
        media: "",
        onload: null,
        setAttribute: () => {},
      }),
      head: { appendChild: () => {} },
    },
  });

  return { classes, themeColor: themeColorMeta.content, cssVars };
}

describe("early-paint theme script", () => {
  test("System follows the OS, not the appearance stored last boot", () => {
    const result = paint({
      hint: JSON.stringify({ mode: "system", appearance: "light" }),
      prefersDark: true,
    });

    expect(result.classes).toContain("dark");
    expect(result.themeColor).toBe("#020202");
  });

  test("System paints light when the OS is light, however it was stored", () => {
    const result = paint({
      hint: JSON.stringify({ mode: "system", appearance: "dark" }),
      prefersDark: false,
    });

    expect(result.classes).not.toContain("dark");
    expect(result.themeColor).toBe("#F4F5F6");
  });

  test("an explicit preference overrules the OS", () => {
    const result = paint({
      hint: JSON.stringify({ mode: "dark", appearance: "dark" }),
      prefersDark: false,
    });

    expect(result.classes).toContain("dark");
  });

  test("Neutral is dark-family, so it carries both classes", () => {
    const result = paint({
      hint: JSON.stringify({ mode: "neutral", appearance: "neutral" }),
      prefersDark: false,
    });

    expect(result.classes).toEqual(expect.arrayContaining(["dark", "neutral"]));
    expect(result.themeColor).toBe("#222325");
  });

  test("a hint written before `mode` existed is still honoured", () => {
    const result = paint({
      hint: JSON.stringify({ appearance: "dark" }),
      prefersDark: false,
    });

    expect(result.classes).toContain("dark");
  });

  test("falls back to the legacy key, then to the OS", () => {
    expect(paint({ legacyTheme: "dark" }).classes).toContain("dark");
    expect(paint({ prefersDark: true }).classes).toContain("dark");
    expect(paint({ prefersDark: false }).classes).toEqual([]);
  });

  test("a corrupt hint paints from the OS instead of throwing", () => {
    const result = paint({ hint: "{not json", prefersDark: true });

    expect(result.classes).toContain("dark");
  });

  test("still applies the saved radius and tracking (no CLS on reload)", () => {
    const result = paint({
      hint: JSON.stringify({
        mode: "system",
        appearance: "dark",
        radius: "lg",
        letterSpacing: "tight",
      }),
      prefersDark: true,
    });

    expect(result.cssVars).toMatchObject({
      "--radius": "0.75rem",
      "--tracking-normal": "-0.02em",
    });
  });
});
