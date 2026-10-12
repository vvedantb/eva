import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

/** `VercelSandboxClient.create` with `//` comments stripped. */
const createBody = (() => {
  const source = readFileSync(
    join(testsDir, "../convex/_sandbox/vercelProvider.ts"),
    "utf8",
  );
  const createAt = source.indexOf("async create(params: SandboxCreateParams)");
  expect(createAt, "VercelSandboxClient.create moved").toBeGreaterThan(-1);
  return source
    .slice(createAt, source.indexOf("\n  async get(", createAt))
    .replace(/^\s*\/\/.*$/gm, "");
})();

/**
 * Fresh sandboxes boot Vercel's managed Ubuntu image. `runtime: "node24"`
 * (Amazon Linux 2023) is deprecated in SDK v3 and must not come back: the
 * seed and runtime installs are verified against Ubuntu's package names.
 */
test("fresh sandboxes boot the managed image, never the legacy runtime", () => {
  const source = readFileSync(
    join(testsDir, "../convex/_sandbox/vercelProvider.ts"),
    "utf8",
  ).replace(/^\s*\/\/.*$/gm, "");
  expect(source).toContain(
    'const VERCEL_SANDBOX_IMAGE = "vercel/sandbox/universal:latest";',
  );
  expect(createBody).toContain(
    "const image = params.image ?? VERCEL_SANDBOX_IMAGE;",
  );
  expect(createBody).toContain("Sandbox.create({ ...opts, image })");
  expect(createBody).not.toMatch(/runtime:\s*"node24"/);
});

/**
 * Vercel forbids `image`/`runtime` on a snapshot source, and eva restores from
 * a snapshot on every warm start — so the image may only reach the fresh
 * branch of `create`.
 */
test("snapshot restores never pass a base image", () => {
  const snapshotBranchAt = createBody.indexOf('source: { type: "snapshot"');
  const freshBranchAt = createBody.indexOf(
    "Sandbox.create({ ...opts, image })",
  );
  expect(snapshotBranchAt).toBeGreaterThan(-1);
  expect(freshBranchAt).toBeGreaterThan(snapshotBranchAt);
  expect(
    createBody.slice(snapshotBranchAt, freshBranchAt),
    "the snapshot branch must not carry runtime/image",
  ).not.toMatch(/\bimage\b|runtime:/);
});
