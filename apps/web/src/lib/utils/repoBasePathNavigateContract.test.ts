import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");

/**
 * Regression (fix #802): `navigate({ to })` matches the route tree *before* the
 * history rewrite in `main.tsx`, so a slash-form monorepo path
 * (`/owner/repo/app/sessions/12`) matches no route and the navigation is a
 * no-op — sending a message left the user sitting on the composer instead of
 * landing on the new session. Every `basePath`-built destination has to be
 * internalized with `toInternalRepoHref` first.
 *
 * `reviewPathNavigateContract.test.ts` pins the three call sites that rebuild a
 * path from `location.pathname`. This one is the class-wide guard: it sweeps
 * every source file, because the bug came back five call sites at a time.
 */
describe("basePath destinations are internalized before navigating", () => {
  const sources = sourceFiles(srcRoot);

  test("the sweep actually reads the app sources", () => {
    expect(sources.length).toBeGreaterThan(200);
    const wrapped = sources.filter(({ source }) =>
      source.includes("toInternalRepoHref("),
    );
    expect(
      wrapped.length,
      "no file internalizes a href — the helper was renamed",
    ).toBeGreaterThan(10);
  });

  test("no `to` takes a raw `${basePath}` template", () => {
    const offenders = sources.flatMap(({ path, source }) =>
      rawBasePathDestinations(source).map(
        (literal) => `${path}: to: ${literal}`,
      ),
    );
    expect(
      offenders,
      "wrap these in toInternalRepoHref(...) — the router never sees the slash form",
    ).toEqual([]);
  });
});

/** Every non-test `.ts`/`.tsx` file under `src`, read once. */
function sourceFiles(root: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      out.push({
        path: relative(root, full),
        source: readFileSync(full, "utf8").replaceAll("\r\n", "\n"),
      });
    }
  };
  walk(root);
  return out;
}

/**
 * Template literals handed straight to a `to:` prop or option that interpolate
 * `basePath`. A wrapped call reads `to: toInternalRepoHref(`…`)`, so the
 * backtick no longer follows `to:` and is correctly not reported.
 */
function rawBasePathDestinations(source: string): string[] {
  const found: string[] = [];
  const opener = /\bto:\s*|\bto=\{\s*/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const at = match.index + match[0].length;
    if (source[at] !== "`") continue;
    const literal = readTemplateLiteral(source, at);
    if (literal !== null && literal.includes("${basePath}")) {
      found.push(literal);
    }
  }
  return found;
}

/** The template literal starting at `open` (a backtick), or null if unclosed. */
function readTemplateLiteral(source: string, open: number): string | null {
  for (let index = open + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "`") return source.slice(open, index + 1);
  }
  return null;
}
