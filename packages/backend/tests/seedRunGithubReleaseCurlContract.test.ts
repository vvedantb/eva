import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

/**
 * The seed-run command list with `//` comment lines stripped. Comments here
 * quote the curl flags and the old `curl -fsSL` form, so an assertion over
 * the raw text would match the prose rather than the command.
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

const githubReleaseCurl = (() => {
  const source = readFileSync(
    join(testsDir, "../convex/snapshotActions.ts"),
    "utf8",
  );
  const match = /const GITHUB_RELEASE_CURL =\s*"([^"]+)"/.exec(source);
  const value = match === null ? undefined : match[1];
  if (value === undefined) {
    throw new Error("GITHUB_RELEASE_CURL moved or was renamed");
  }
  return value;
})();

const githubReleaseDownloadFunction = (() => {
  const source = readFileSync(
    join(testsDir, "../convex/snapshotActions.ts"),
    "utf8",
  );
  const match = /const GITHUB_RELEASE_DOWNLOAD_FUNCTION = `([\s\S]*?)`;/m.exec(
    source,
  );
  const value = match === null ? undefined : match[1];
  if (value === undefined) {
    throw new Error("GITHUB_RELEASE_DOWNLOAD_FUNCTION moved or was renamed");
  }
  return value;
})();

/**
 * A carepulse-ts web snapshot died at toolchain install with
 * `curl: (56) Connection died, tried 5 times` fetching the gh tarball over
 * HTTP/2. `--retry` does not cover that; HTTP/1.1 plus `--retry-all-errors`
 * does, matching the config-file chunk download fix.
 */
describe("seed run GitHub release downloads survive direct-path failures", () => {
  test("the shared curl uses HTTP/1.1 and retries error 56", () => {
    expect(githubReleaseCurl).toContain("--http1.1");
    expect(githubReleaseCurl).toContain("--retry 5");
    expect(githubReleaseCurl).toContain("--retry-all-errors");
    expect(githubReleaseCurl).not.toContain("-fsSL");
  });

  test("every GitHub artifact install uses the shared downloader", () => {
    const calls = seedRunCommands.match(/github_release_download\s+\S+/g);
    // code-server appears twice: an .rpm (Vercel) and a .deb (Boat) variant.
    expect(
      new Set(calls).size,
      "supabase, gh, rg, fd, git-lfs, and code-server each call github_release_download",
    ).toBe(6);
    expect(seedRunCommands).not.toMatch(/curl -fsSL https:\/\/github\.com/);
  });

  test("the downloader falls back to GitHub's release asset API", () => {
    expect(githubReleaseDownloadFunction).toContain(
      "https://api.github.com/repos/$repo/releases/tags/$tag",
    );
    expect(githubReleaseDownloadFunction).toContain(
      ".assets[] | select(.name == $asset)",
    );
    expect(githubReleaseDownloadFunction).toContain(
      '-H "Accept: application/octet-stream"',
    );
  });

  test("gh falls back to the official yum repo if the tarball fails", () => {
    const ghLine = [...seedRunCommands.matchAll(/^.*SEEDRUN-FAILED:gh-cli.*$/gm)]
      .map((match) => match[0])
      .at(0);
    if (ghLine === undefined) {
      throw new Error("the gh-cli failure marker moved");
    }
    expect(ghLine).toContain("github_release_download cli/cli");
    expect(ghLine).toContain("cli.github.com/packages/rpm/gh-cli.repo");
    expect(ghLine).toContain("dnf install -y gh --repo gh-cli");
    expect(ghLine).toContain("exit 1");
  });

  test("OpenCode is pinned separately from the other agent CLIs", () => {
    expect(seedRunCommands).toContain(
      "sudo npm install -g opencode-ai@${OPENCODE_VERSION}",
    );
    // CLI and SDK are one release: the SDK is a generated client for the
    // server the CLI serves, so they must never drift apart.
    expect(seedRunCommands).toContain(
      "opencode-ai@${OPENCODE_VERSION} @opencode-ai/sdk@${OPENCODE_VERSION}",
    );
    const sharedAgentInstall = seedRunCommands
      .split("\n")
      .find((line) => line.includes("@anthropic-ai/claude-code"));
    expect(sharedAgentInstall).toBeDefined();
    expect(sharedAgentInstall).not.toContain("opencode-ai");
  });
});
