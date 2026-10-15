import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/**
 * Bash keywords that open a block. A line ending in one of these needs a newline
 * after it: `"; "` produces `then; `, `else; `, `do; `, all of which are
 * "syntax error near unexpected token ';'".
 */
const BLOCK_OPENERS = ["then", "else", "do", "in"];

/**
 * Sandbox scripts are built as arrays of lines and joined into one shell string.
 * A multi-line block joined with `"; "` is a syntax error, which is how the
 * Supabase restore step came to fail on every warm boot from a seeded snapshot
 * (fix a244ca73). Every `"; "`-joined array therefore has to keep each block on
 * a single line.
 */
describe("shell scripts with blocks are joined with newlines", () => {
  const arrays = semicolonJoinedArrays();

  test("the scan finds the joins it is meant to check", () => {
    expect(arrays.length, "the sandbox scripts moved").toBeGreaterThan(5);
  });

  test("no block keyword is left for the join to terminate", () => {
    const broken = arrays.filter((array) =>
      array.lines.some((line) => endsWithBlockOpener(line)),
    );
    expect(
      broken.map((array) => array.where),
      'join("\\n") instead, or keep the whole block in one element',
    ).toEqual([]);
  });

  /**
   * The site the fix landed on, pinned directly: its array does contain blocks,
   * so the newline join is load-bearing rather than incidental.
   */
  test("the seeded-runtime restore keeps its newline join", () => {
    const source = readSource("_sandbox_runtime/devServer.ts");
    const startAt = source.indexOf("async function restoreSeededSupabaseDump(");
    expect(startAt, "restoreSeededSupabaseDump moved").toBeGreaterThan(-1);
    const body = source.slice(
      startAt,
      source.indexOf("\nexport ", startAt + 1),
    );
    const script = body.slice(body.indexOf("await execHandle("));
    expect(script).toContain('].join("\\n")');
    expect(
      script.split("\n").some((line) => endsWithBlockOpener(line.trim())),
      "the block this join exists for is gone — the pin is now vacuous",
    ).toBe(true);
  });
});

/** True for a script line whose last word opens a bash block. */
function endsWithBlockOpener(line: string): boolean {
  const code = line
    .replace(/,$/, "")
    .replace(/^[`'"]|[`'"]$/g, "")
    .trim();
  const lastWord = code.split(/\s+/).at(-1);
  return lastWord !== undefined && BLOCK_OPENERS.includes(lastWord);
}

/**
 * Every array literal in the Convex sources that is joined with `"; "`, as its
 * own list of source lines. Found by walking back from the join to the `[` that
 * opens it, so nested brackets inside elements are counted rather than guessed.
 */
function semicolonJoinedArrays(): { where: string; lines: string[] }[] {
  const found: { where: string; lines: string[] }[] = [];
  for (const path of convexFiles()) {
    const source = readSource(path);
    let at = source.indexOf('].join("; ")');
    while (at > -1) {
      const openAt = matchingOpenBracket(source, at);
      if (openAt > -1) {
        const body = source.slice(openAt + 1, at);
        // Multi-line arrays only: a one-line array has no block to split.
        if (body.includes("\n")) {
          found.push({
            where: `${path}:${source.slice(0, at).split("\n").length}`,
            lines: body
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
          });
        }
      }
      at = source.indexOf('].join("; ")', at + 1);
    }
  }
  return found;
}

/** The `[` that the `]` at `closeAt` closes, or -1 if the source is unbalanced. */
function matchingOpenBracket(source: string, closeAt: number): number {
  let depth = 0;
  for (let at = closeAt; at >= 0; at -= 1) {
    if (source[at] === "]") depth += 1;
    if (source[at] === "[") {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/** Comments describe the very syntax these rules rule out, so they go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

function convexFiles(): string[] {
  return readdirSync(convexDir, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !path.includes("_generated"));
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
