import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { HELPER_SCRIPT } from "../convex/_sandbox_runtime/gitCredentials";

/**
 * Regression for #1084: the in-sandbox `git-credential-eva` helper cached a
 * token for a fixed 50 minutes from fetch time, but the backend can hand out a
 * token that is already up to 59 minutes old. Pushes then failed with GitHub
 * "Invalid username or token". These tests run the real helper script with a
 * stubbed `curl` and check the cache follows the token's own `expiresAt`.
 */

const SANDBOX_CONFIG_PATH = "/home/eva/.config/eva/git-credentials.env";
const SANDBOX_CACHE_PREFIX = "/tmp/git-cred-cache-";
const REQUEST = "protocol=https\nhost=github.com\npath=acme/app.git\n";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "git-cred-helper-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Writes the helper with its sandbox paths moved into the temp dir, plus a fake curl. */
function installHelper(): string {
  expect(HELPER_SCRIPT).toContain(SANDBOX_CONFIG_PATH);
  expect(HELPER_SCRIPT).toContain(SANDBOX_CACHE_PREFIX);
  const script = HELPER_SCRIPT.replaceAll(
    SANDBOX_CONFIG_PATH,
    join(dir, "config.env"),
  ).replaceAll(SANDBOX_CACHE_PREFIX, join(dir, "cache-"));
  const helperPath = join(dir, "git-credential-eva");
  writeFileSync(helperPath, script);
  chmodSync(helperPath, 0o755);
  writeFileSync(
    join(dir, "config.env"),
    "EVA_SANDBOX_SECRET=secret\nCONVEX_SITE_URL=https://example.convex.site\n",
  );
  // Each call appends a line to `curl-calls` and prints the canned response.
  writeFileSync(
    join(dir, "curl"),
    `#!/usr/bin/env bash\necho call >> "${dir}/curl-calls"\ncat "${dir}/response.json"\n`,
  );
  chmodSync(join(dir, "curl"), 0o755);
  return helperPath;
}

function setResponse(body: Record<string, string | number>): void {
  writeFileSync(join(dir, "response.json"), JSON.stringify(body));
}

function runHelper(helperPath: string): string {
  return execFileSync(helperPath, ["get"], {
    input: REQUEST,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
  });
}

function curlCalls(): number {
  try {
    return readFileSync(join(dir, "curl-calls"), "utf8")
      .split("\n")
      .filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** Seeds the cache file the helper reads for REQUEST's path (same cksum key). */
function writeCacheFile(firstLine: number, token: string): void {
  const key = execFileSync(
    "bash",
    ["-c", "printf '%s' acme/app.git | cksum | cut -d' ' -f1"],
    { encoding: "utf8" },
  ).trim();
  writeFileSync(join(dir, `cache-${key}`), `${firstLine}\n${token}\n`);
}

describe("git-credential-eva token cache", () => {
  test("a long-lived token is cached and reused without a second fetch", () => {
    const helper = installHelper();
    setResponse({ token: "ghs_fresh", expiresAt: nowSeconds() + 3600 });

    expect(runHelper(helper)).toContain("password=ghs_fresh");
    setResponse({ token: "ghs_other", expiresAt: nowSeconds() + 3600 });
    expect(runHelper(helper)).toContain("password=ghs_fresh");
    expect(curlCalls()).toBe(1);
  });

  test("a token near its real expiry is served but never cached", () => {
    const helper = installHelper();
    // The backend's GitHub App client handed out an old token: 2 minutes left.
    setResponse({ token: "ghs_old", expiresAt: nowSeconds() + 120 });

    expect(runHelper(helper)).toContain("password=ghs_old");
    setResponse({ token: "ghs_new", expiresAt: nowSeconds() + 3600 });
    expect(runHelper(helper)).toContain("password=ghs_new");
    expect(curlCalls()).toBe(2);
  });

  test("a response without expiresAt is not cached", () => {
    const helper = installHelper();
    setResponse({ username: "x-access-token", token: "ghs_legacy" });

    expect(runHelper(helper)).toContain("password=ghs_legacy");
    expect(runHelper(helper)).toContain("password=ghs_legacy");
    expect(curlCalls()).toBe(2);
  });

  test("a cache entry inside the expiry margin is refetched", () => {
    const helper = installHelper();
    writeCacheFile(nowSeconds() + 200, "ghs_dying");
    setResponse({ token: "ghs_new", expiresAt: nowSeconds() + 3600 });

    expect(runHelper(helper)).toContain("password=ghs_new");
    expect(curlCalls()).toBe(1);
  });

  test("an old-format cache file (fetch time on line one) reads as expired", () => {
    const helper = installHelper();
    // Pre-#1084 helpers wrote the fetch timestamp, which the old code treated
    // as fresh for 50 minutes. It must not be read as an expiry now.
    writeCacheFile(nowSeconds(), "ghs_stale");
    setResponse({ token: "ghs_new", expiresAt: nowSeconds() + 3600 });

    expect(runHelper(helper)).toContain("password=ghs_new");
    expect(curlCalls()).toBe(1);
  });
});
