/**
 * Installs a *working* ffmpeg — the encoder behind `agent-browser record`.
 *
 * Shared by the seed run (`snapshotActions.ts`, which bakes it into the seeded
 * snapshot) and `VercelDesktop.start` (which repairs snapshots taken before, or
 * broken by, an earlier revision of this script). One copy: the two drifted
 * apart once already, and a fix applied to one of them is invisible in the other.
 *
 * Every step is gated on `ffmpeg -version` actually succeeding rather than on
 * the previous `dnf` exit code. That is the whole lesson of the libjack bug:
 * AL2023's `pipewire-jack-audio-connection-kit-libs` *claims* the
 * `libjack.so.0()(64bit)` capability but installs the library into a private
 * directory (`/usr/lib64/pipewire-0.3/jack`) that is not on the loader path, so
 * `dnf` reported success, the `||` fallbacks behind it never ran, and every
 * sandbox from that snapshot had an ffmpeg binary that died on launch with
 * `libjack.so.0: cannot open shared object file`. Only running the binary tells
 * you whether the install worked.
 *
 * Soft-failing throughout: a dnf mirror hiccup must degrade recording to
 * screenshots, never fail seed prep or block the desktop from starting.
 *
 * Distro-aware, because a seeded AL2023 snapshot and a fresh Ubuntu managed
 * image both restore into this same script. It deliberately does NOT route
 * through `eva_pkg_install` (_sandbox_runtime/packageManager.ts): that helper
 * reports success from the package manager's exit code, which is exactly the
 * signal the libjack bug above proved worthless here.
 */
export const FFMPEG_INSTALL_SCRIPT = [
  "if ! ffmpeg -version >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then",
  "  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg >/tmp/ffmpeg-apt.log 2>&1 || true",
  "fi",
  "if ! ffmpeg -version >/dev/null 2>&1; then",
  "  sudo dnf install -y spal-release >/tmp/spal-dnf.log 2>&1 || true",
  "  sudo dnf install -y ffmpeg-free >/tmp/ffmpeg-dnf.log 2>&1 || true",
  "fi",
  "if ! ffmpeg -version >/dev/null 2>&1; then",
  "  sudo dnf install -y ffmpeg >>/tmp/ffmpeg-dnf.log 2>&1 || true",
  "fi",
  "if ! ffmpeg -version >/dev/null 2>&1; then",
  "  sudo dnf install -y jack-audio-connection-kit >/tmp/libjack-dnf.log 2>&1 || true",
  "fi",
  "if ! ffmpeg -version >/dev/null 2>&1; then",
  '  sudo dnf install -y "libjack.so.0()(64bit)" >>/tmp/libjack-dnf.log 2>&1 || true',
  "fi",
  "if ! ffmpeg -version >/dev/null 2>&1 && [ -e /usr/lib64/pipewire-0.3/jack/libjack.so.0 ]; then",
  "  echo /usr/lib64/pipewire-0.3/jack | sudo tee /etc/ld.so.conf.d/pipewire-jack.conf >/dev/null && sudo ldconfig || true",
  "fi",
].join("\n");
