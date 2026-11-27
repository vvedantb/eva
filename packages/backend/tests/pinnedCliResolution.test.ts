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
import { afterEach, beforeEach, expect, test } from "bun:test";
import { stubEnv, unstubAllEnvs } from "./_helpers/env";
import { resolvePinnedCliBinary } from "../callback-src/providers/claudeSdk.js";
import { pinnedCliInstallCommand } from "../convex/_sandbox_runtime/launch";

const PACKAGE = "@anthropic-ai/claude-code";
const STALE = "2.1.258";
const PINNED = "2.1.283";

let root = "";
let npmLog = "";
const nodeDir = dirname(Bun.which("node") ?? process.execPath);

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
  stubEnv(
    "PATH",
    [
      join(imagePrefix(), "bin"),
      join(userPrefix(), "bin"),
      stubs,
      nodeDir,
      "/usr/bin",
      "/bin",
    ].join(":"),
  );
});

afterEach(() => {
  unstubAllEnvs();
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
