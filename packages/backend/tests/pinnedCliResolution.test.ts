import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resolvePinnedCliBinary } from "../callback-src/providers/claudeSdk.js";
import { pinnedCliInstallCommand } from "../convex/_sandbox_runtime/launch";

/**
 * Behavioural guard for session 197 (2026-09-26): a `claude update` in the
 * terminal put the pinned CLI in the user's npm prefix, behind the image's
 * stale copy on PATH. Launch saw the pin somewhere and skipped the fallback
 * install; the callback judged the PATH copy, found drift, had no fallback,
 * and ran the stale CLI. These tests rebuild that layout on disk and run the
 * real launch guard and callback resolver against it, so the two cannot drift
 * apart on which copy counts again.
 */

const PACKAGE = "@anthropic-ai/claude-code";
const STALE = "2.1.258";
const PINNED = "2.1.283";

let root = "";
let npmLog = "";

/** Lays out `<prefix>/bin/claude` plus its package manifest at `version`. */
function installCli(prefix: string, version: string): string {
  const bin = join(prefix, "bin", "claude");
  mkdirSync(dirname(bin), { recursive: true });
  writeFileSync(bin, "#!/bin/sh\n");
  chmodSync(bin, 0o755);
  const packageRoot = join(prefix, "lib", "node_modules", PACKAGE);
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ version }));
  return bin;
}

const imagePrefix = (): string => join(root, "image");
const userPrefix = (): string => join(root, "user");
const fallbackPrefix = (): string => join(root, "fallback");
const fallbackBin = (): string => join(fallbackPrefix(), "bin", "claude");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pinned-cli-"));
  npmLog = join(root, "npm.log");
  // Stub npm: records its argv and performs the `install -g --prefix` layout
  // for real, so the callback can then judge what launch installed.
  const stubs = join(root, "stubs");
  mkdirSync(stubs);
  writeFileSync(
    join(stubs, "npm"),
    [
      "#!/bin/sh",
      `echo "$*" >> ${JSON.stringify(npmLog)}`,
      'prefix="$4"; spec="$5"; pkg="${spec%@*}"; ver="${spec##*@}"',
      'mkdir -p "$prefix/bin" "$prefix/lib/node_modules/$pkg"',
      `printf '{"version":"%s"}' "$ver" > "$prefix/lib/node_modules/$pkg/package.json"`,
      'printf "#!/bin/sh\\n" > "$prefix/bin/claude"; chmod +x "$prefix/bin/claude"',
    ].join("\n"),
  );
  chmodSync(join(stubs, "npm"), 0o755);
  // Image copy first on PATH, the user's `claude update` copy behind it, then
  // the stub npm ahead of the real node toolchain.
  vi.stubEnv(
    "PATH",
    [
      join(imagePrefix(), "bin"),
      join(userPrefix(), "bin"),
      stubs,
      dirname(process.execPath),
      "/usr/bin",
      "/bin",
    ].join(":"),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function runLaunchGuard(): void {
  execFileSync(
    "sh",
    [
      "-c",
      pinnedCliInstallCommand({
        binName: "claude",
        packageName: PACKAGE,
        fallbackInstallDir: fallbackPrefix(),
        fallbackPackageRoot: join(fallbackPrefix(), "lib", "node_modules", PACKAGE),
        version: PINNED,
      }),
    ],
    { env: process.env, stdio: "ignore" },
  );
}

const npmCalls = (): string[] =>
  existsSync(npmLog) ? readFileSync(npmLog, "utf8").trim().split("\n") : [];

function resolveClaude(): string {
  return resolvePinnedCliBinary({
    packageName: PACKAGE,
    binName: "claude",
    pinnedVersion: PINNED,
    fallbackBinPath: fallbackBin(),
  });
}

test("a pinned copy behind the stale PATH copy still triggers the fallback install, and the agent runs it", () => {
  const staleBin = installCli(imagePrefix(), STALE);
  installCli(userPrefix(), PINNED);

  runLaunchGuard();

  expect(npmCalls()).toEqual([
    `install -g --prefix ${fallbackPrefix()} ${PACKAGE}@${PINNED}`,
  ]);
  const resolved = resolveClaude();
  expect(resolved).toBe(fallbackBin());
  expect(resolved).not.toBe(staleBin);
});

test("the PATH copy at the pin skips the install and is the one the agent runs", () => {
  const pathBin = installCli(imagePrefix(), PINNED);
  installCli(userPrefix(), STALE);

  runLaunchGuard();

  expect(npmCalls()).toEqual([]);
  expect(resolveClaude()).toBe(pathBin);
});

test("a fallback already at the pin skips the install and wins over a stale PATH copy", () => {
  installCli(imagePrefix(), STALE);
  installCli(fallbackPrefix(), PINNED);

  runLaunchGuard();

  expect(npmCalls()).toEqual([]);
  expect(resolveClaude()).toBe(fallbackBin());
});
