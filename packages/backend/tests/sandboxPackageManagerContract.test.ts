import { execFileSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import {
  CHROME_RUNTIME_LIBRARY_PACKAGES,
  CORE_TOOLCHAIN_PACKAGES,
  PACKAGE_ALIASES,
  PACKAGE_HELPER_SCRIPT,
  pkgInstall,
  pkgInstallScript,
} from "../convex/_sandbox_runtime/packageManager";

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

  test("every alias id is safe inside a case arm", () => {
    for (const id of Object.keys(PACKAGE_ALIASES)) {
      expect(id, `${id} is not case-arm safe`).toMatch(/^[a-z0-9.+_-]+$/);
    }
  });
});

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

  test("an unmapped id falls through to itself", () => {
    expect(resolve("some-identical-name", "apt")).toBe("some-identical-name");
    expect(resolve("some-identical-name", "dnf")).toBe("some-identical-name");
  });
});
