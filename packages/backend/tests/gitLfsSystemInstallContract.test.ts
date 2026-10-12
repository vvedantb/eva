import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

/**
 * The seed-run command list with `//` comment lines stripped. The prose there
 * quotes the very strings these tests assert on (`/opt/git/etc`, the old
 * `>/dev/null` redirect), so an assertion over the raw text would match the
 * comment rather than the command.
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
 * `git lfs install --system` broke EVERY seeded snapshot build for five days
 * (a5efe413 → 90ac4907) and nobody noticed, because the image's primary git is
 * a custom build under /opt/git whose system config resolves to a directory the
 * image does not ship — and the failure was swallowed by a `>/dev/null 2>&1`
 * redirect. Nothing else catches this: the step "succeeds" from the build's
 * point of view, and the damage only shows up much later as clones of LFS repos
 * containing pointer stubs where real files should be.
 */
describe("seed run registers git-lfs system filters", () => {
  const mkdirAt = seedRunCommands.indexOf("sudo mkdir -p /opt/git/etc");

  /** Every `git-lfs install --system` invocation, in source order. */
  const registrations = [
    ...seedRunCommands.matchAll(/^.*git-lfs install --system.*$/gm),
  ].map((match) => ({ text: match[0], at: match.index }));

  test("creates /opt/git/etc before any --system registration", () => {
    expect(
      mkdirAt,
      "the custom /opt/git build cannot lock a config file in a directory that does not exist",
    ).toBeGreaterThan(-1);
    expect(registrations.length).toBeGreaterThan(0);
    for (const registration of registrations) {
      expect(
        registration.at,
        "a --system registration runs before /opt/git/etc exists",
      ).toBeGreaterThan(mkdirAt);
    }
  });

  /**
   * Two registrations, not one: /opt/git's git and the package-manager-installed
   * /usr/bin/git read different system configs, and a checkout run by either
   * has to resolve LFS pointers.
   */
  test("registers against both /opt/git and /etc/gitconfig", () => {
    expect(registrations).toHaveLength(2);
    expect(
      registrations.some((r) =>
        r.text.includes("GIT_CONFIG_SYSTEM=/etc/gitconfig"),
      ),
      "/usr/bin/git needs its own filter.lfs entries",
    ).toBe(true);
  });

  /**
   * The redirect is what turned a hard failure into five days of silence. Keep
   * the output in seedrun.log so the next breakage is legible.
   */
  test("never silences the registration output", () => {
    for (const registration of registrations) {
      expect(
        registration.text,
        "a swallowed error here is invisible until a clone comes back as pointer stubs",
      ).not.toContain("/dev/null");
    }
  });

  /** A failed registration must still fail the build loudly. */
  test("each registration fails the seed run on error", () => {
    for (const registration of registrations) {
      expect(registration.text).toContain("SEEDRUN-FAILED:git-lfs-filters");
      expect(registration.text).toContain("exit 1");
    }
  });
});
