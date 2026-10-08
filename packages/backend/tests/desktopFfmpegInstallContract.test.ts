import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { FFMPEG_INSTALL_SCRIPT } from "../convex/_sandbox/ffmpegInstall";

const testsDir = dirname(fileURLToPath(import.meta.url));

const vercelProviderSource = readFileSync(
  join(testsDir, "../convex/_sandbox/vercelProvider.ts"),
  "utf8",
);

const snapshotActionsSource = readFileSync(
  join(testsDir, "../convex/snapshotActions.ts"),
  "utf8",
);

/**
 * `VercelDesktop.start`'s body with `//` comments stripped — the prose there
 * mentions the very gates these tests order against, so an ordering assertion
 * run over the raw text matches the comment instead of the code.
 */
const desktopStartBody = (() => {
  const classAt = vercelProviderSource.indexOf("class VercelDesktop");
  expect(classAt, "VercelDesktop moved or was renamed").toBeGreaterThan(-1);
  const startAt = vercelProviderSource.indexOf("async start()", classAt);
  expect(startAt).toBeGreaterThan(-1);
  const nextMethodAt = vercelProviderSource.indexOf("\n  async ", startAt + 1);
  return vercelProviderSource
    .slice(startAt, nextMethodAt < 0 ? undefined : nextMethodAt)
    .replace(/^\s*\/\/.*$/gm, "");
})();

/** Every `dnf` attempt in the script, in source order. */
const installAttempts = FFMPEG_INSTALL_SCRIPT.split("\n").filter((line) =>
  line.includes("dnf install"),
);

/**
 * `agent-browser record` needs ffmpeg to encode the WebM. Older snapshots bake
 * the VNC stack but not ffmpeg, so an install that sits inside the desktop
 * health/install logic never runs — both the healthy early-return and the
 * `INSTALLED=1` guard bypass it — and those sandboxes can never record.
 * The install has to come before either gate.
 */
test("desktop start installs ffmpeg before the health gate and install guard", () => {
  const ffmpegAt = desktopStartBody.indexOf("FFMPEG_INSTALL_SCRIPT");
  expect(ffmpegAt, "desktop start must install ffmpeg").toBeGreaterThan(-1);

  const gates = [
    // Healthy stack → early return, skipping everything below.
    "if (healthy.exitCode === 0)",
    // Already-installed VNC stack → the dnf block is skipped.
    'if [ "$INSTALLED" != "1" ]; then',
  ];
  for (const gate of gates) {
    const gateAt = desktopStartBody.indexOf(gate);
    expect(gateAt, `gate moved: ${gate}`).toBeGreaterThan(-1);
    expect(
      ffmpegAt,
      `ffmpeg install must precede \`${gate}\` or older snapshots skip it forever`,
    ).toBeLessThan(gateAt);
  }
});

/**
 * Seed bakes the encoder into the snapshot; desktop start repairs snapshots
 * taken before it did. Both must run the same script — the two hand-maintained
 * copies drifted once, so a fix landed in one and not the other.
 */
test("seed and desktop start share one install script", () => {
  expect(snapshotActionsSource).toContain("FFMPEG_INSTALL_SCRIPT");
  expect(snapshotActionsSource).not.toContain("ffmpeg-free");
  expect(vercelProviderSource).not.toContain("ffmpeg-free");
});

/** Soft-failing and idempotent, so a dnf hiccup cannot block desktop startup. */
test("the ffmpeg install is idempotent and cannot block startup", () => {
  expect(
    FFMPEG_INSTALL_SCRIPT.startsWith("if ! ffmpeg -version"),
    "the install must be gated so re-running is a no-op",
  ).toBe(true);
  for (const attempt of installAttempts) {
    expect(attempt, "a failing dnf must not throw out of startup").toContain(
      "|| true",
    );
  }
});

test("the health probe catches a present but unloadable ffmpeg binary", () => {
  expect(FFMPEG_INSTALL_SCRIPT).not.toContain("command -v ffmpeg");
});

/**
 * The libjack regression. `pipewire-jack-audio-connection-kit-libs` claims the
 * `libjack.so.0()(64bit)` capability but installs the library off the loader
 * path, so `dnf` exits 0 while ffmpeg still dies on launch. Chaining the next
 * attempt behind `||` therefore skipped it, and the sandbox stayed broken.
 * Each attempt must be re-gated on the binary actually running.
 */
test("each install attempt is gated on ffmpeg running, not on dnf's exit code", () => {
  expect(installAttempts.length).toBeGreaterThan(1);
  expect(
    FFMPEG_INSTALL_SCRIPT.match(/if ! ffmpeg -version/g)?.length,
    "every attempt needs its own `ffmpeg -version` gate",
  ).toBeGreaterThanOrEqual(installAttempts.length - 1);
  for (const attempt of installAttempts) {
    expect(
      attempt.includes("|| sudo dnf install"),
      `chaining hides a dnf that "succeeds" without fixing ffmpeg: ${attempt}`,
    ).toBe(false);
  }
});

test("the repair installs ffmpeg, then real jack, then the capability match", () => {
  const order = [
    "ffmpeg-free",
    "jack-audio-connection-kit",
    '"libjack.so.0()(64bit)"',
  ].map((needle) => FFMPEG_INSTALL_SCRIPT.indexOf(needle));
  for (const at of order) expect(at).toBeGreaterThan(-1);
  expect(order, "real jack is the only package that lands on the loader path").
    toEqual([...order].sort((a, b) => a - b));
});

/** The shim pipewire hides in a private directory is the last resort. */
test("the loader-path repair runs only after every package attempt", () => {
  const ldconfigAt = FFMPEG_INSTALL_SCRIPT.indexOf("ldconfig");
  expect(ldconfigAt).toBeGreaterThan(-1);
  for (const attempt of installAttempts) {
    expect(FFMPEG_INSTALL_SCRIPT.indexOf(attempt)).toBeLessThan(ldconfigAt);
  }
  expect(
    FFMPEG_INSTALL_SCRIPT,
    "do not write the drop-in when pipewire's shim is absent",
  ).toContain("[ -e /usr/lib64/pipewire-0.3/jack/libjack.so.0 ]");
});
