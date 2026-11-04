/**
 * Installs the voxl desktop streamer (see ./desktopStreamer.ts) into
 * /usr/local/bin/voxl. Exits non-zero when voxl cannot run, so the caller
 * falls back to noVNC.
 *
 * voxl ships no Linux binary, so Eva publishes one built on the Vercel
 * `universal` Ubuntu image (same glibc and sonames) as a GitHub release asset.
 * Pinned by sha256: a swapped asset must fail the install, not run in every
 * sandbox. It links x264 (GPL-2.0); the release notes point to
 * the voxl and x264 sources.
 *
 * Gated on `voxl --version` actually running, like FFMPEG_INSTALL_SCRIPT: a
 * present binary with a missing shared library is not an install. Ubuntu only —
 * AL2023 has no x264/libyuv packages, so it exits 1 there.
 *
 * To upgrade: rebuild on the universal image (`cargo build --release`, see the
 * voxl README), `strip`, upload under a new tag, and bump the constants below.
 */
const VOXL_VERSION = "0.3.2";
const VOXL_URL = `https://github.com/vvedantb/eva/releases/download/voxl-v${VOXL_VERSION}/voxl-${VOXL_VERSION}-linux-x86_64-ubuntu`;
const VOXL_SHA256 =
  "c1d212e39c0e3d03153cec85f2d06de8604f85e4bf9dc9784bfc0f536df19e96";

export const VOXL_INSTALL_SCRIPT = [
  `if /usr/local/bin/voxl --version 2>/dev/null | grep -qx 'voxl ${VOXL_VERSION}'; then exit 0; fi`,
  "command -v apt-get >/dev/null 2>&1 || { echo 'voxl: needs an Ubuntu image' >&2; exit 1; }",
  // Runtime libraries only (the -dev packages are build-time).
  "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y libx264-165 libyuv0 libopus0 libpulse0 >/tmp/voxl-apt.log 2>&1 || true",
  `curl -fsSL --retry 3 -o /tmp/voxl.download '${VOXL_URL}' || { echo 'voxl: download failed' >&2; exit 1; }`,
  `echo '${VOXL_SHA256}  /tmp/voxl.download' | sha256sum -c --quiet - || { echo 'voxl: checksum mismatch' >&2; rm -f /tmp/voxl.download; exit 1; }`,
  "sudo install -m 0755 /tmp/voxl.download /usr/local/bin/voxl && rm -f /tmp/voxl.download",
  "/usr/local/bin/voxl --version >/dev/null 2>&1 || { echo 'voxl: binary does not run' >&2; ldd /usr/local/bin/voxl | grep 'not found' >&2; exit 1; }",
].join("\n");
