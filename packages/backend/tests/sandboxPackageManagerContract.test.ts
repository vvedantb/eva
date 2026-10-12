import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  CHROME_RUNTIME_LIBRARY_PACKAGES,
  CORE_TOOLCHAIN_PACKAGES,
  PACKAGE_ALIASES,
  PACKAGE_HELPER_SCRIPT,
  pkgInstall,
  pkgInstallScript,
} from "../convex/_sandbox_runtime/packageManager";

const testsDir = dirname(fileURLToPath(import.meta.url));
const readSource = (relative: string) =>
  readFileSync(join(testsDir, "..", relative), "utf8");

/**
 * Managed Images move new sandboxes to Ubuntu while every snapshot seeded
 * before the flip stays Amazon Linux 2023 — and both restore into the same
 * runtime code. Every install therefore has to go through the shared helper;
 * a stray `dnf install` would work on a restored old snapshot and silently
 * fail on a fresh Ubuntu one (or vice versa for a stray `apt-get`).
 */
describe("no module installs packages behind the shared helper's back", () => {
  const modules = [
    "convex/snapshotActions.ts",
    "convex/_sandbox/vercelProvider.ts",
    "convex/_sandbox_runtime/helpers.ts",
    "convex/_sandbox_runtime/git.ts",
    "convex/_pty/vercel.ts",
    "convex/_pty/launchDevServerInVercelConsole.ts",
  ];

  for (const relative of modules) {
    test(`${relative} has no direct package-manager call`, () => {
      const source = readSource(relative).replace(/^\s*\/\/.*$/gm, "");
      expect(source, "use pkgInstall / eva_pkg_install_*").not.toMatch(
        /\bdnf install\b/,
      );
      expect(source, "use pkgInstall / eva_pkg_install_*").not.toMatch(
        /\bapt-get install\b/,
      );
      expect(source, "vendor repos belong in packageManager.ts").not.toMatch(
        /yum\.repos\.d|sources\.list\.d/,
      );
    });
  }
});

describe("package alias table", () => {
  test("every referenced package id has an entry", () => {
    for (const id of [
      ...CORE_TOOLCHAIN_PACKAGES,
      ...CHROME_RUNTIME_LIBRARY_PACKAGES,
    ]) {
      expect(PACKAGE_ALIASES[id], `missing alias for ${id}`).toBeDefined();
    }
  });

  test("every entry resolves on both managers", () => {
    for (const [id, byManager] of Object.entries(PACKAGE_ALIASES)) {
      expect(
        byManager.apt.length,
        `${id} has no apt candidate`,
      ).toBeGreaterThan(0);
      expect(
        byManager.dnf.length,
        `${id} has no dnf candidate`,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * Ubuntu 24.04 renamed several libraries for the 64-bit time_t ABI break and
   * 26.04 dropped some of those suffixes again, so the two releases disagree per
   * package. Both spellings must stay listed — which one leads is decided by
   * what the Phase 1 harness actually installed on the managed image, never by
   * a rule of thumb.
   */
  test("libraries that were renamed across releases list both spellings", () => {
    for (const id of ["alsa", "cups-libs", "gtk3", "at-spi2"]) {
      const apt = PACKAGE_ALIASES[id]?.apt ?? [];
      expect(apt.length, `${id} needs a fallback candidate`).toBeGreaterThan(1);
      expect(
        apt.some((name) => name.endsWith("t64")),
        `${id} must keep its t64 spelling as a candidate`,
      ).toBe(true);
    }
  });

  /**
   * Verified against `vercel/sandbox/universal` (Ubuntu 26.04) by the Phase 1
   * harness — these are the exact names apt resolved, not inferred ones. A
   * change here means someone guessed; re-run the spike before trusting it.
   */
  test("primary apt names match what the managed image installed", () => {
    const observed: Record<string, string> = {
      docker: "docker.io",
      procps: "procps",
      psmisc: "psmisc",
      "vnc-server": "tigervnc-standalone-server",
      "vnc-common": "tigervnc-common",
      "x11-utils": "x11-utils",
      xterm: "xterm",
      "dbus-x11": "dbus-x11",
      gtk3: "libgtk-3-0",
      nss: "libnss3",
      alsa: "libasound2t64",
      libxtst: "libxtst6",
      "at-spi2": "libatspi2.0-0",
      libdrm: "libdrm2",
      libgbm: "libgbm1",
      libxkbcommon: "libxkbcommon0",
      libxdamage: "libxdamage1",
      libxcomposite: "libxcomposite1",
      libxrandr: "libxrandr2",
      libxcursor: "libxcursor1",
      libxinerama: "libxinerama1",
      "cups-libs": "libcups2",
    };
    for (const [id, name] of Object.entries(observed)) {
      expect(PACKAGE_ALIASES[id]?.apt[0], `${id} drifted`).toBe(name);
    }
  });

  test("pkgInstall rejects an unknown package id", () => {
    expect(() => pkgInstall("definitely-not-a-package")).toThrow(
      /Unknown sandbox package id/,
    );
  });
});

/**
 * The helper is emitted as one element of arrays joined with both `"\n"` and
 * `"; "`. `}` followed by `; ` is valid bash, but only if the definitions
 * themselves parse — so check the real thing rather than trusting the shape.
 */
describe("the emitted bash parses", () => {
  const parses = (script: string) => {
    execFileSync("bash", ["-n", "-c", script], { stdio: "pipe" });
  };

  test("the helper definitions parse standalone", () => {
    expect(() => parses(PACKAGE_HELPER_SCRIPT)).not.toThrow();
  });

  test("the helper parses when joined with '; '", () => {
    expect(() =>
      parses([PACKAGE_HELPER_SCRIPT, "echo ok"].join("; ")),
    ).not.toThrow();
  });

  test("a full install snippet parses", () => {
    expect(() => parses(pkgInstallScript("docker", "git", "jq"))).not.toThrow();
  });

  /**
   * `ensureDockerDaemon` used to join its script with `"; "`, which put a
   * literal `;` straight after `sudo setsid dockerd … &` — a bash syntax error.
   * The script never parsed, so the whole Docker recovery path silently threw
   * into its catch and logged "Docker not available". Any array containing a
   * backgrounded command must be newline-joined.
   */
  test("no shell script array joins a backgrounded command with '; '", () => {
    for (const relative of [
      "convex/_sandbox_runtime/helpers.ts",
      "convex/snapshotActions.ts",
      "convex/_sandbox/vercelProvider.ts",
    ]) {
      const source = readSource(relative);
      // `… &",` (element ends by backgrounding) immediately before a `join("; ")`
      // is the exact shape that breaks; check each join's own array.
      const joins = [...source.matchAll(/\[([\s\S]*?)\]\.join\("; "\)/g)];
      for (const [, body] of joins) {
        expect(
          body,
          `${relative}: a backgrounded command cannot be joined with "; "`,
        ).not.toMatch(/&"\s*,/);
      }
    }
  });

  /**
   * The alias table is compiled into a bash `case`; an id containing `)` or a
   * quote would produce a syntactically valid but wrong arm.
   */
  test("every alias id is safe inside a case arm", () => {
    for (const id of Object.keys(PACKAGE_ALIASES)) {
      expect(id, `${id} is not case-arm safe`).toMatch(/^[a-z0-9.+_-]+$/);
    }
  });
});

/**
 * `eva__pkg_candidates` is the whole point of the table — resolve it by
 * actually running the generated bash rather than re-implementing the lookup.
 */
describe("candidate resolution", () => {
  const resolve = (id: string, manager: "apt" | "dnf") =>
    execFileSync(
      "bash",
      ["-c", `${PACKAGE_HELPER_SCRIPT}\neva__pkg_candidates ${id} ${manager}`],
      { encoding: "utf8" },
    ).trim();

  test("maps distro-specific names", () => {
    expect(resolve("g++", "apt")).toBe("g++");
    expect(resolve("g++", "dnf")).toBe("gcc-c++");
    expect(resolve("procps", "apt")).toBe("procps");
    expect(resolve("procps", "dnf")).toBe("procps-ng");
    expect(resolve("docker", "apt")).toBe("docker.io");
    expect(resolve("docker", "dnf")).toBe("docker");
  });

  test("emits fallbacks in priority order", () => {
    expect(resolve("alsa", "apt")).toBe("libasound2t64 libasound2");
  });

  /** An id absent from the table means "same name everywhere". */
  test("an unmapped id falls through to itself", () => {
    expect(resolve("some-identical-name", "apt")).toBe("some-identical-name");
    expect(resolve("some-identical-name", "dnf")).toBe("some-identical-name");
  });
});
