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
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  HELPER_CONFIG_PATH,
  HELPER_SCRIPT,
} from "../convex/_sandbox_runtime/gitCredentials";
import { toSandboxGitCredential } from "../convex/githubAuth";

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
    writeFileSync(cacheFile(), `${nowSeconds()}\nghs_legacy\n`);
    respond({ token: "ghs_new", expiresAt: nowSeconds() + 3600 });

    expect(runHelper()).toContain("password=ghs_new");
    expect(curlCalls()).toBe(1);
  });

  const backendResponse = (token: string, expiresInSeconds: number) => ({
    username: "x-access-token",
    ...toSandboxGitCredential({
      token,
      expiresAt: new Date(
        Date.now() + expiresInSeconds * 1000,
      ).toISOString(),
    }),
  });

  test("the backend's expiresAt is unix seconds the helper caches against", () => {
    const response = backendResponse("ghs_backend", 3600);
    respond(response);

    expect(runHelper()).toContain("password=ghs_backend");
    expect(readFileSync(cacheFile(), "utf8").split("\n")[0]).toBe(
      String(response.expiresAt),
    );
    expect(Math.abs(response.expiresAt - (nowSeconds() + 3600))).toBeLessThanOrEqual(1);
  });

  test("a near-expiry token from the backend is not cached", () => {
    respond(backendResponse("ghs_backend_old", 240));

    expect(runHelper()).toContain("password=ghs_backend_old");
    expect(existsSync(cacheFile())).toBe(false);
  });

  test("a response without expiresAt is not cached", () => {
    respond({ token: "ghs_noexpiry" });

    expect(runHelper()).toContain("password=ghs_noexpiry");
    expect(existsSync(cacheFile())).toBe(false);
  });
});
