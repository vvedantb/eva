import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { z } from "zod";

const testsDir = dirname(fileURLToPath(import.meta.url));
const convexDir = join(testsDir, "../convex");
const sharedDir = join(testsDir, "../../shared");
const sharedBarrel = join(sharedDir, "src/index.ts");

/**
 * `@eva/shared`'s root barrel is imported by Convex functions, and the Convex
 * bundler cannot resolve frontend packages — React, `@eva/ui`, `facehash`,
 * `convex-helpers/react`. A single component re-exported from the barrel
 * therefore breaks every Convex deploy, not just the module that pulled it in
 * (2026-09-02: `UserInitials` did exactly that, and moved to the
 * `@eva/shared/user-initials` subpath).
 *
 * An import rule on `index.ts` catches only what that one file imports
 * directly. The barrel's whole relative closure is bundled, so the closure is
 * what has to stay clean — a frontend import one hop deeper is the same
 * outage.
 */

/** Every `from "..."` / bare `import "..."` specifier in a module. */
function specifiersIn(source: string): string[] {
  return [...source.matchAll(/\b(?:from|import)\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

const EXTENSION_CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveRelative(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier);
  const resolved = EXTENSION_CANDIDATES.map((ext) => `${base}${ext}`).find(
    (path) => existsSync(path) && !path.endsWith("/"),
  );
  if (resolved === undefined) {
    throw new Error(`Cannot resolve "${specifier}" from ${fromFile}`);
  }
  return resolved;
}

/** Files the Convex bundler pulls in for `import ... from "@eva/shared"`. */
function barrelClosure(): { files: string[]; bare: string[] } {
  const files: string[] = [];
  const bare: string[] = [];
  const queue = [sharedBarrel];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.includes(file)) continue;
    files.push(file);
    for (const specifier of specifiersIn(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) {
        queue.push(resolveRelative(file, specifier));
      } else {
        bare.push(specifier);
      }
    }
  }
  return { files, bare };
}

const FRONTEND_ONLY = [
  "react",
  "react-dom",
  "@eva/ui",
  "facehash",
  "convex-helpers/react",
];

function isFrontendOnly(specifier: string): boolean {
  return FRONTEND_ONLY.some(
    (banned) => specifier === banned || specifier.startsWith(`${banned}/`),
  );
}

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFilesUnder(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

test("the @eva/shared barrel closure is free of frontend-only imports", () => {
  const { bare } = barrelClosure();

  expect(bare.filter(isFrontendOnly)).toEqual([]);
});

test("no JSX module is reachable from the @eva/shared barrel", () => {
  // A `.tsx` file in the closure means a component is being re-exported, which
  // drags React in even when the import itself looks harmless.
  const { files } = barrelClosure();

  expect(files.filter((file) => file.endsWith(".tsx"))).toEqual([]);
});

test("Convex functions still import the root barrel", () => {
  // The constraint only matters while Convex depends on it. If this stops
  // being true the tests above are the wrong guard and should go, rather than
  // being quietly satisfied by nothing importing the barrel at all.
  const importers = tsFilesUnder(convexDir).filter((file) =>
    specifiersIn(readFileSync(file, "utf8")).includes("@eva/shared"),
  );

  expect(importers.length).toBeGreaterThan(0);
});

test("the frontend components stay reachable on their own subpath", () => {
  // The fix moved them rather than dropping them, so `@eva/shared` has to keep
  // exposing the subpath `apps/web` imports.
  const manifest = z
    .object({ exports: z.record(z.string(), z.string()) })
    .parse(JSON.parse(readFileSync(join(sharedDir, "package.json"), "utf8")));

  expect(manifest.exports["./user-initials"]).toBe(
    "./src/components/user-initials.tsx",
  );
});
