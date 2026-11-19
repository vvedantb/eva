import { expect, test } from "vitest";
import { FFMPEG_INSTALL_SCRIPT } from "../convex/_sandbox/ffmpegInstall";

/** Every `dnf` attempt in the script, in source order. */
const installAttempts = FFMPEG_INSTALL_SCRIPT.split("\n").filter((line) =>
  line.includes("dnf install"),
);

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
