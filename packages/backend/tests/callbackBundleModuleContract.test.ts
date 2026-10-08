import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The sandbox daemon does not run from `callback-src`: it runs from the esbuild
 * bundle frozen into `callbackScript.generated.ts` and shipped as a string.
 * A source edit only reaches a sandbox once `pnpm build:callback` reruns, and
 * nothing else notices when it has not — the callback typecheck passes, every
 * `callback-src/tests/*` unit test passes against the source, and the feature
 * is simply absent in prod.
 *
 * That has already happened twice: the branch watcher landed while the bundle
 * was still the pre-merge copy (#781 had to rebuild it after main was merged,
 * and main's cursorSdk change was stale in the bundle before that). Both were
 * caught by eye. A generated file is also the worst possible merge target —
 * git line-merges the single template literal happily.
 *
 * The bundle records which modules it contains: esbuild writes a
 * `// callback-src/<path>` comment ahead of each one. Comparing that list
 * against the source tree catches a whole module that never shipped, and a
 * module deleted from source whose code is still running in the sandbox.
 * It does not prove every *edit* landed — the paired "source and deployed
 * bundle" assertions in the other contract tests carry that.
 */

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const callbackDir = join(backendDir, "callback-src");
const bundle = readFileSync(
  join(backendDir, "convex/_sandbox_runtime/callbackScript.generated.ts"),
  "utf8",
);

/** Directories under `callback-src` that never bundle. */
const SKIPPED_DIRS = new Set(["tests", ".build", "fixtures", "node_modules"]);

type CallbackModule = { id: string; source: string };

function callbackModules(): CallbackModule[] {
  const found: CallbackModule[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED_DIRS.has(entry)) walk(path);
        continue;
      }
      if (!path.endsWith(".ts") || path.endsWith(".d.ts")) continue;
      found.push({
        id: "callback-src/" + relative(callbackDir, path).replaceAll("\\", "/"),
        source: readFileSync(path, "utf8"),
      });
    }
  };
  walk(callbackDir);
  return found;
}

/**
 * Type-only modules are erased before bundling, so their absence is correct.
 * A file with no exports at all (the `index.ts` entry point) is not type-only.
 */
function isTypeOnly(source: string): boolean {
  const exports = source.match(/^export\s+\S+/gm) ?? [];
  if (exports.length === 0) return false;
  return exports.every((line) => /^export\s+(type|interface)\b/.test(line));
}

/** Module paths esbuild stamped into the bundle. */
function bundledModuleIds(): Set<string> {
  const ids = new Set<string>();
  for (const match of bundle.matchAll(
    /\/\/ (callback-src\/[A-Za-z0-9_./-]+\.ts)\n/g,
  )) {
    ids.add(match[1]);
  }
  return ids;
}

describe("the shipped callback bundle matches the callback source tree", () => {
  it("bundles every runtime module in callback-src", () => {
    const bundled = bundledModuleIds();
    // Sanity: the marker format is esbuild's, so a format change must fail
    // loudly here rather than silently emptying the comparison below.
    expect(bundled.has("callback-src/index.ts")).toBe(true);

    const missing = callbackModules()
      .filter((module) => !isTypeOnly(module.source))
      .map((module) => module.id)
      .filter((id) => !bundled.has(id))
      .sort();

    expect(
      missing,
      "callback-src modules absent from the shipped bundle — run `pnpm build:callback`",
    ).toEqual([]);
  });

  it("ships no module that has left the source tree", () => {
    const sourceIds = new Set(callbackModules().map((module) => module.id));
    const stale = [...bundledModuleIds()]
      .filter((id) => !sourceIds.has(id))
      .sort();

    expect(
      stale,
      "the bundle still carries deleted or renamed modules — run `pnpm build:callback`",
    ).toEqual([]);
  });

  it("is one un-merged CALLBACK_SCRIPT assignment", () => {
    // A git line-merge of the generated file leaves conflict markers or two
    // half-bundles glued together, either of which deploys as valid TypeScript
    // and then explodes inside the sandbox.
    expect(bundle).not.toMatch(/^(<{7}|={7}|>{7})/m);
    expect(bundle.match(/export const CALLBACK_SCRIPT/g)?.length).toBe(1);
    expect(bundle.startsWith('"use node";\n')).toBe(true);
    expect(bundle.trimEnd().endsWith("`.trim();")).toBe(true);
  });
});
