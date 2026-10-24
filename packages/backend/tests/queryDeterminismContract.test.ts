import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/**
 * Convex caches query results and invalidates them on data dependencies, never on
 * wall-clock time. A query that reads the clock therefore keeps serving whatever
 * the clock said when the result was first computed: an old MCP OAuth client
 * lookup kept an expired registration alive past its 24h TTL that way (found by
 * convex-doctor). The fix is always the same — take `now` as an arg, so
 * the clock is read in the mutation or action that can safely read it.
 *
 * Nothing in the type system or the test suite catches this: the query compiles,
 * runs, and returns a plausible answer.
 */
const FORBIDDEN = ["Date.now()", "Math.random()", "new Date()"];

describe("Convex queries are deterministic", () => {
  /**
   * No exceptions. The six analytics and presence queries that used to be
   * grandfathered in here now take their timestamp as an argument, so there is
   * no longer a list to add to — which is the point: an exception list becomes a
   * set of excuses nobody audits.
   */
  test("no query reads the clock", () => {
    expect(
      findClockReadingQueries(),
      "take the timestamp as an arg and pass it from the caller instead",
    ).toEqual([]);
  });
});

/**
 * Every `authQuery`/`internalQuery`/`query` definition that names a clock call in
 * its own body, as `file|exportName`.
 *
 * Deliberately source-text: the failure is invisible at runtime — a stale cached
 * result is a well-formed answer to a question asked at the wrong time.
 */
function findClockReadingQueries(): string[] {
  const found: string[] = [];
  const files = readdirSync(convexDir, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".ts"))
    // Generated code and bundled copies are not hand-written query definitions.
    .filter((path) => !path.includes("_generated"))
    .filter((path) => !path.endsWith(".generated.ts"));

  for (const path of files) {
    // Comments name the very calls being ruled out, so they have to go first.
    const source = stripComments(readFileSync(join(convexDir, path), "utf8"));
    for (const match of source.matchAll(
      /export const (\w+) = (?:authQuery|internalQuery|query)\(\{/g,
    )) {
      const end = source.indexOf("\n});", match.index);
      const body = source.slice(match.index, end < 0 ? undefined : end);
      if (FORBIDDEN.some((call) => body.includes(call))) {
        found.push(`${path.replaceAll("\\", "/")}|${match[1]}`);
      }
    }
  }
  return found;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
