import { execFileSync, execSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  HELPER_CONFIG_PATH,
  HELPER_SCRIPT,
} from "../convex/_sandbox_runtime/gitCredentials";

/**
 * PR #1084. The in-sandbox git credential helper cached every token for a
 * fixed 50 minutes from fetch time. The backend's GitHub App client hands out
 * tokens that may already be up to 59 minutes old, so the helper kept serving
 * dead tokens and pushes failed with "Invalid username or token". The cache
 * must now run to the token's own `expiresAt` minus a 5-minute margin.
 *
 * These tests run the real generated bash script against a fake `curl`, so a
 * regression in the shell logic (not just the TypeScript) fails here.
 */

function hasShellTools(): boolean {
  try {
    execSync("command -v bash && command -v jq && command -v cksum", {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const bashDescribe = hasShellTools() ? describe : describe.skip;

type Fixture = {
  dir: string;
  script: string;
  cachePrefix: string;
  responseFile: string;
  callsFile: string;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

bashDescribe("git credential helper caches to the token's real expiry", () => {
  let fx: Fixture;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "git-cred-helper-"));
    const binDir = join(dir, "bin");
    const configPath = join(dir, "git-credentials.env");
    const cachePrefix = join(dir, "git-cred-cache-");
    const responseFile = join(dir, "response.json");
    const callsFile = join(dir, "calls");

    execSync(`mkdir -p ${binDir}`);
    // Fake curl: count each call and print the canned backend response.
    writeFileSync(
      join(binDir, "curl"),
      `#!/usr/bin/env bash\necho x >> "${callsFile}"\ncat "${responseFile}"\n`,
    );
    chmodSync(join(binDir, "curl"), 0o755);
    writeFileSync(
      configPath,
      "EVA_SANDBOX_SECRET=secret\nCONVEX_SITE_URL=https://example.invalid\n",
    );

    const script = join(dir, "git-credential-eva");
    writeFileSync(
      script,
      HELPER_SCRIPT.replace(HELPER_CONFIG_PATH, configPath).replaceAll(
        "/tmp/git-cred-cache-",
        cachePrefix,
      ),
    );
    chmodSync(script, 0o755);

    fx = { dir, script, cachePrefix, responseFile, callsFile };
  });

  afterEach(() => {
    rmSync(fx.dir, { recursive: true, force: true });
  });

  const respond = (body: Record<string, string | number>) =>
    writeFileSync(fx.responseFile, JSON.stringify(body));

  const runHelper = () =>
    execFileSync("bash", [fx.script, "get"], {
      input: "protocol=https\nhost=github.com\npath=owner/repo.git\n\n",
      env: {
        ...process.env,
        PATH: `${join(fx.dir, "bin")}:${process.env.PATH ?? ""}`,
      },
      encoding: "utf8",
    });

  const curlCalls = () =>
    existsSync(fx.callsFile)
      ? readFileSync(fx.callsFile, "utf8").trim().split("\n").length
      : 0;

  const cacheFile = () => {
    const key = execSync("printf '%s' owner/repo.git | cksum | cut -d' ' -f1", {
      encoding: "utf8",
    }).trim();
    return `${fx.cachePrefix}${key}`;
  };

  test("a fresh token is cached and reused until near its expiry", () => {
    respond({ token: "ghs_fresh", expiresAt: nowSeconds() + 3600 });

    expect(runHelper()).toContain("password=ghs_fresh");
    expect(runHelper()).toContain("password=ghs_fresh");
    expect(curlCalls()).toBe(1);
  });

  test("a token the backend hands out near expiry is never cached", () => {
    // The #1084 case: the backend's own cache returns a 56-minute-old token.
    respond({ token: "ghs_old", expiresAt: nowSeconds() + 240 });

    expect(runHelper()).toContain("password=ghs_old");
    expect(existsSync(cacheFile())).toBe(false);

    respond({ token: "ghs_new", expiresAt: nowSeconds() + 3600 });
    expect(runHelper()).toContain("password=ghs_new");
    expect(curlCalls()).toBe(2);
  });

  test("a cached token inside the expiry margin is refetched", () => {
    writeFileSync(cacheFile(), `${nowSeconds() + 120}\nghs_stale\n`);
    respond({ token: "ghs_new", expiresAt: nowSeconds() + 3600 });

    expect(runHelper()).toContain("password=ghs_new");
    expect(curlCalls()).toBe(1);
  });

  test("a legacy fetch-time cache entry is not served as valid", () => {
    // The old helper wrote the fetch timestamp on line one. Read as an expiry,
    // it is already past, so the token must be refetched.
    writeFileSync(cacheFile(), `${nowSeconds()}\nghs_legacy\n`);
    respond({ token: "ghs_new", expiresAt: nowSeconds() + 3600 });

    expect(runHelper()).toContain("password=ghs_new");
    expect(curlCalls()).toBe(1);
  });

  test("a response without expiresAt is not cached", () => {
    respond({ token: "ghs_noexpiry" });

    expect(runHelper()).toContain("password=ghs_noexpiry");
    expect(existsSync(cacheFile())).toBe(false);
  });
});
