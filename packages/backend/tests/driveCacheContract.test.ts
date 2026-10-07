import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  DRIVE_CACHE_ENV,
  DRIVE_CACHE_ROOT,
  DRIVE_MOUNT_PATH,
  driveCacheSetupScript,
  driveRedundantLocalPruneLines,
} from "../convex/_sandbox/driveCache";
import { snapshotPruneScript } from "../convex/_sandbox/snapshotPrune";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const provider = stripComments(
  readFileSync(
    join(backendDir, "convex/_sandbox/vercelProvider.ts"),
    "utf8",
  ).replaceAll("\r\n", "\n"),
);

/**
 * The cache mount is kernel state, so a stop wipes it. Before the fix the
 * setup ran only at create, and every resumed sandbox got a cold cache. The
 * SDK holds `onResume` per Sandbox object, so every lookup and create must
 * pass it, or that path resumes cold again.
 */
describe("drive cache is re-wired on resume", () => {
  test("every Sandbox.get passes the resume hook", () => {
    const calls = callBodies(provider, "Sandbox.get({");
    expect(calls.length, "no Sandbox.get calls found").toBeGreaterThan(0);
    for (const body of calls) {
      expect(body).toContain("onResume: rewireDriveCacheOnResume");
    }
  });

  test("create and fork take the hook from the shared base options", () => {
    const create = functionBody(provider, "  async create(params");
    const base = create.slice(
      create.indexOf("const base = {"),
      create.indexOf("};", create.indexOf("const base = {")),
    );
    expect(base).toContain("onResume: rewireDriveCacheOnResume");
    // Every create/fork spreads `opts`, which is built from `base`.
    expect(create).toContain("const opts = { ...base,");
    for (const call of ["Sandbox.fork({", "Sandbox.create({"]) {
      for (const body of callBodies(create, call)) {
        expect(body).toContain("...opts");
      }
    }
  });

  test("the hook never throws, so it cannot fail the resume", () => {
    const body = functionBody(
      provider,
      "async function rewireDriveCacheOnResume(",
    );
    expect(body).toContain("driveCacheSetupScript()");
    expect(body).toContain("try {");
    expect(body).toContain("catch");
    expect(body).not.toContain("throw");
  });
});

/**
 * The setup script runs at create AND on every resume, so it must be
 * idempotent, never fail, and probe the mount instead of trusting the role:
 * a write-lock clash demotes a writer to a read-only snapshot.
 */
describe("driveCacheSetupScript", () => {
  const script = driveCacheSetupScript();

  test("exits early when the cache root is already a mount", () => {
    expect(script).toContain(`mountpoint -q ${DRIVE_CACHE_ROOT}`);
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
  });

  test("probes writability before bind-mounting the Drive", () => {
    const probeAt = script.indexOf(`touch ${DRIVE_MOUNT_PATH}/`);
    const bindAt = script.indexOf("mount --bind");
    const overlayAt = script.indexOf("mount -t overlay");
    expect(probeAt).toBeGreaterThan(-1);
    expect(probeAt).toBeLessThan(bindAt);
    // A read-only Drive gets an overlay, never a bind.
    expect(bindAt).toBeLessThan(overlayAt);
  });

  test("creates and opens every cache dir the env points at", () => {
    for (const dir of Object.values(DRIVE_CACHE_ENV)) {
      expect(dir.startsWith(`${DRIVE_CACHE_ROOT}/`)).toBe(true);
      expect(script).toMatch(new RegExp(`mkdir -p [^\\n]*${dir}`));
      expect(script).toMatch(new RegExp(`chmod 777 [^\\n]*${dir}`));
    }
  });

  test("chmod is not recursive", () => {
    // A recursive chmod walks the whole warm package store on every create.
    expect(script).not.toMatch(/chmod\s+-R/);
  });
});

/**
 * The prune deletes local caches the Drive replaced. It must run after the
 * teardown unmounts the cache, or `rm` empties the Drive itself.
 */
describe("snapshot prune never touches the Drive", () => {
  test("createSnapshot unmounts the cache before it prunes", () => {
    const body = functionBody(provider, "  async createSnapshot(");
    const teardownAt = body.indexOf("driveCacheTeardownScript()");
    const pruneAt = body.indexOf("snapshotPruneScript()");
    expect(teardownAt, "the teardown call moved").toBeGreaterThan(-1);
    expect(pruneAt, "the prune call moved").toBeGreaterThan(-1);
    expect(teardownAt).toBeLessThan(pruneAt);
  });

  test("prune targets are home-dir caches, never the Drive paths", () => {
    const script = snapshotPruneScript();
    for (const line of driveRedundantLocalPruneLines(["/home/eva"])) {
      expect(script).toContain(line);
    }
    for (const line of script.split("\n").filter((l) => l.includes("rm "))) {
      expect(line).not.toContain(DRIVE_CACHE_ROOT);
      expect(line).not.toContain(DRIVE_MOUNT_PATH);
    }
  });

  test("prune is best-effort and always exits 0", () => {
    const script = snapshotPruneScript();
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
    for (const line of script.split("\n").filter((l) => l.includes("rm "))) {
      expect(line).toContain("|| true");
    }
  });
});

/** Each `marker(...)` call, from the marker to its first closing `})`. */
function callBodies(source: string, marker: string): string[] {
  const bodies: string[] = [];
  let from = source.indexOf(marker);
  while (from > -1) {
    const end = source.indexOf("})", from);
    bodies.push(source.slice(from, end < 0 ? undefined : end));
    from = source.indexOf(marker, from + marker.length);
  }
  return bodies;
}

/** One function or method, ending on the first `\n}` or `\n  }` after it. */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const indent = header.match(/^ */)?.[0] ?? "";
  const end = source.indexOf(`\n${indent}}`, startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** Comments name the calls these rules check, so they have to go first. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
