import { expect, test } from "bun:test";
import { FFMPEG_INSTALL_SCRIPT } from "../convex/_sandbox/ffmpegInstall";

const installAttempts = FFMPEG_INSTALL_SCRIPT.split("\n").filter((line) =>
  line.includes("dnf install"),
);

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
