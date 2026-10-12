import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  CORE_TOOLCHAIN_PACKAGES,
  PACKAGE_ALIASES,
} from "../convex/_sandbox_runtime/packageManager";

const testsDir = dirname(fileURLToPath(import.meta.url));

/**
 * The seed-run command list with `//` comment lines stripped.
 */
const seedRunCommands = (() => {
  const source = readFileSync(
    join(testsDir, "../convex/snapshotActions.ts"),
    "utf8",
  );
  const startAt = source.indexOf("export const launchSeedRun");
  expect(startAt, "launchSeedRun moved or was renamed").toBeGreaterThan(-1);
  const nextAt = source.indexOf("\nexport ", startAt + 1);
  return source
    .slice(startAt, nextAt < 0 ? undefined : nextAt)
    .replace(/^\s*\/\/.*$/gm, "");
})();

/**
 * A carepulse-ts web snapshot died at `SEEDRUN-FAILED:agent-clis` because
 * agentation-mcp's better-sqlite3 native addon could not compile: the
 * fresh Vercel sandbox has no `make`/`gcc`. Those packages must land in the
 * core toolchain install, before the global npm install.
 */
describe("seed run installs node-gyp tools before agent CLIs", () => {
  test("the core toolchain includes gcc, g++, and make", () => {
    for (const id of ["gcc", "g++", "make"]) {
      expect(
        [...CORE_TOOLCHAIN_PACKAGES],
        `${id} dropped out of the core toolchain`,
      ).toContain(id);
    }
  });

  /**
   * The distro-neutral ids only help if they resolve on BOTH package managers —
   * AL2023 calls the C++ compiler `gcc-c++`, Ubuntu calls it `g++`.
   */
  test("each node-gyp package resolves on apt and dnf", () => {
    expect(PACKAGE_ALIASES["g++"]).toEqual({ apt: ["g++"], dnf: ["gcc-c++"] });
    for (const id of ["gcc", "make"]) {
      expect(PACKAGE_ALIASES[id]?.apt.length).toBeGreaterThan(0);
      expect(PACKAGE_ALIASES[id]?.dnf.length).toBeGreaterThan(0);
    }
  });

  test("those packages are installed before the agent-clis npm install", () => {
    const toolchainAt = seedRunCommands.indexOf(
      "SEEDRUN-FAILED:toolchain-packages",
    );
    const npmAt = seedRunCommands.indexOf("SEEDRUN-FAILED:agent-clis");
    expect(toolchainAt, "the toolchain failure marker moved").toBeGreaterThan(
      -1,
    );
    expect(npmAt).toBeGreaterThan(-1);
    expect(toolchainAt).toBeLessThan(npmAt);
    expect(seedRunCommands).toContain("agentation-mcp@");
  });

  /** The toolchain install is fatal — every later stage assumes it succeeded. */
  test("a failed toolchain install aborts the seed", () => {
    const line = [
      ...seedRunCommands.matchAll(/^.*SEEDRUN-FAILED:toolchain-packages.*$/gm),
    ]
      .map((match) => match[0])
      .at(0);
    if (line === undefined) {
      throw new Error("the toolchain failure marker moved");
    }
    expect(line).toContain("exit 1");
  });
});
