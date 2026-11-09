// Guard: the mobile bundle must not use JS methods that Hermes release builds
// can lack. `toSorted` crept in through vercel-react-best-practices advice; it
// threw inside the MFA step and left the sign-in button spinning (0.1.4).
// Use `[...items].sort(...)`, `[...items].reverse()` and `findLast` loops instead.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const mobileRoot = new URL("..", import.meta.url).pathname;
const sharedSrc = join(mobileRoot, "../../packages/shared/src");

const FORBIDDEN = /\.(toSorted|toReversed|toSpliced|findLast|findLastIndex|with|at)\(|Object\.groupBy|Map\.groupBy|Array\.fromAsync/;

function sourceFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) found.push(path);
  }
  return found;
}

// Shared modules the mobile app imports (`@eva/shared` barrel and subpaths), plus their local imports.
function sharedFilesFor(mobileFiles) {
  const exportsMap = JSON.parse(readFileSync(join(sharedSrc, "../package.json"), "utf8")).exports;
  const entries = new Set([join(sharedSrc, "index.ts")]);
  for (const file of mobileFiles) {
    for (const [, sub] of readFileSync(file, "utf8").matchAll(/["']@eva\/shared(\/[\w-]+)?["']/g)) {
      const target = exportsMap[sub ? `.${sub}` : "."];
      if (typeof target === "string") entries.add(join(sharedSrc, "..", target));
    }
  }
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, spec] of readFileSync(file, "utf8").matchAll(/from\s+["'](\.[^"']*)["']/g)) {
      const base = join(file, "..", spec);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
        try {
          if (statSync(candidate).isFile()) queue.push(candidate);
        } catch {
          // Not this candidate.
        }
      }
    }
  }
  return [...seen];
}

test("the mobile bundle uses no Hermes-risky APIs", () => {
  const mobileFiles = ["src", "app", "components"].flatMap((dir) => sourceFiles(join(mobileRoot, dir)));
  const files = [...mobileFiles, ...sharedFilesFor(mobileFiles)];
  const hits = [];
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, "");
        if (FORBIDDEN.test(code)) hits.push(`${relative(mobileRoot, file)}:${index + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(hits, [], `Hermes release builds can lack these methods:\n${hits.join("\n")}`);
});
