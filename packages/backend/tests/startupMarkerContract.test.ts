import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

// The marker path lives in `_sandbox_runtime/startupMarker.ts`; its content is
// the startup fingerprint, so every raw write redirects into the path constant.
const RAW_WRITE_MARKER = "> ${STARTUP_MARKER_PATH}";
const LIVE_WRITE_MARKER = "writeStartupMarker(sandbox";

/**
 * The marker file is a claim: "this sandbox's startup/seed sequence already ran
 * to completion." Three separate paths trust it and skip work on that basis —
 * `startupCommandsMarkerExists` skips the startup commands, and two branches in
 * git.ts skip `git clean -fd` and the sandbox-config copy to preserve seeded
 * runtime state.
 *
 * So writing it after a failed run brands the sandbox as seeded forever: every
 * later resume skips the seed and the database stays empty, with nothing
 * surfacing the fault (fix 0a283062). Only a clean run may write it.
 */
describe("the startup marker is only written by a clean run", () => {
  /**
   * Two writers, by design: the live sandbox path and the seeded-snapshot build
   * that bakes the marker into the captured filesystem. A third would need its
   * own success proof, so it fails here first.
   */
  test("only two places write the marker", () => {
    expect(filesContaining(RAW_WRITE_MARKER)).toEqual([
      "_sandbox_runtime/startupMarker.ts",
      "snapshotActions.ts",
    ]);
    expect(filesContaining(LIVE_WRITE_MARKER)).toEqual([
      "_sandbox_runtime/execution.ts",
    ]);
  });
});

describe("runStartupCommandsDirect", () => {
  const source = readSource("_sandbox_runtime/execution.ts");
  const body = functionBody(
    source,
    "export async function runStartupCommandsDirect(",
  );

  /**
   * The loop deliberately swallows per-command failures and keeps going, so the
   * only thing standing between a half-failed run and a permanently mislabelled
   * sandbox is this guard.
   */
  test("the marker is written inside the no-errors branch", () => {
    const guardAt = body.indexOf("if (errors.length === 0) {");
    const elseAt = body.indexOf("} else {", guardAt);
    const writeAt = body.indexOf(LIVE_WRITE_MARKER);

    expect(guardAt, "the clean-run guard moved or was renamed").toBeGreaterThan(
      -1,
    );
    expect(writeAt, "the marker write moved").toBeGreaterThan(-1);
    expect(elseAt, "the failure branch moved").toBeGreaterThan(guardAt);
    expect(
      writeAt,
      "the marker is written outside the clean-run guard",
    ).toBeGreaterThan(guardAt);
    expect(writeAt, "the marker is written on the failure path").toBeLessThan(
      elseAt,
    );
  });

  /** Errors have to be collected before the guard can mean anything. */
  test("the marker is written after every command has run", () => {
    expect(body.indexOf("errors.push(")).toBeLessThan(
      body.indexOf(LIVE_WRITE_MARKER),
    );
  });

  /**
   * The skip is what makes the marker load-bearing. Gating it on `force` is the
   * only way an operator can re-seed a sandbox that already carries one.
   */
  test("the skip-if-present check is gated on force", () => {
    const forceAt = body.indexOf("if (!args.force) {");
    const checkAt = body.indexOf("startupMarkerMatches(");
    expect(forceAt, "the force gate moved").toBeGreaterThan(-1);
    expect(checkAt, "the marker check moved").toBeGreaterThan(forceAt);
  });

  /** A failed run has to say so, since the absence of the marker is silent. */
  test("a failed run logs why it withheld the marker", () => {
    const elseAt = body.indexOf("} else {");
    expect(body.slice(elseAt)).toContain("NOT writing marker");
  });
});

/**
 * The build-side writer. Here the success proof is the shell script's own
 * structure: every user-supplied command is wrapped so a non-zero exit kills
 * the script before it reaches the marker. A command pushed without that
 * wrapper would let a failed seed be captured as a seeded snapshot — the same
 * bug as 0a283062, one layer down, and it would ship to every sandbox that
 * boots from the snapshot.
 */
describe("the seed-run script cannot reach the marker after a failure", () => {
  const source = readSource("snapshotActions.ts");
  const commandLines = userCommandLines(source);

  test("the scan found the command wrappers", () => {
    expect(commandLines.length).toBeGreaterThan(4);
  });

  test("every user command aborts the script when it fails", () => {
    for (const line of commandLines) {
      expect(line, "a user command runs without a fail-fast wrapper").toContain(
        "exit 1",
      );
    }
  });

  /** The seed stage is the last thing that can fail before the marker. */
  test("the marker is pushed after the seed commands", () => {
    const seedStageAt = source.indexOf("SEEDRUN-STAGE:seed-commands");
    const markerAt = source.indexOf(RAW_WRITE_MARKER);
    expect(seedStageAt, "the seed stage moved").toBeGreaterThan(-1);
    expect(markerAt, "the marker push moved").toBeGreaterThan(seedStageAt);
  });

  /**
   * And the done marker comes last of all: `pollSeedRun` treats
   * `.seedrun-done` as the signal to capture, so anything pushed after it can
   * be captured mid-flight.
   */
  test("the run-complete marker is the last thing pushed", () => {
    expect(source.indexOf(RAW_WRITE_MARKER)).toBeLessThan(
      source.indexOf("touch /tmp/.seedrun-done"),
    );
  });
});

/** Convex files containing `needle`, relative to `convex/`, sorted. */
function filesContaining(needle: string): string[] {
  const found: string[] = [];
  for (const file of convexSources()) {
    const source = stripComments(
      readFileSync(file, "utf8").replaceAll("\r\n", "\n"),
    );
    if (!source.includes(needle)) continue;
    found.push(file.slice(convexDir.length + 1).replaceAll("\\", "/"));
  }
  return found.sort();
}

/** Every `( ${command} )` template pushed into the seed script. */
function userCommandLines(source: string): string[] {
  return [...source.matchAll(/`\(\s*\$\{command\}\s*\)[^`]*`/g)].map(
    (match) => match[0],
  );
}

function convexSources(): string[] {
  const walk = (dir: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "_generated") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) found.push(...walk(full));
      else if (entry.endsWith(".ts")) found.push(full);
    }
    return found;
  };
  return walk(convexDir);
}

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** Slices from a declaration to the next top-level one. */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
