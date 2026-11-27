/** Package manager flavours eva's sandbox images ship. */
export type PackageManager = "apt" | "dnf";

/**
 * Distro-neutral package id → candidate package names per manager, in priority
 * order. The first candidate that installs wins; later entries exist for names
 * that drifted between releases (Ubuntu's `t64` ABI rename, AL2023's SPAL split).
 */
export const PACKAGE_ALIASES: Record<
  string,
  Record<PackageManager, readonly string[]>
> = {
  docker: { apt: ["docker.io"], dnf: ["docker"] },
  git: { apt: ["git"], dnf: ["git"] },
  jq: { apt: ["jq"], dnf: ["jq"] },
  gzip: { apt: ["gzip"], dnf: ["gzip"] },
  tar: { apt: ["tar"], dnf: ["tar"] },
  procps: { apt: ["procps"], dnf: ["procps-ng"] },
  psmisc: { apt: ["psmisc"], dnf: ["psmisc"] },
  tmux: { apt: ["tmux"], dnf: ["tmux"] },
  curl: { apt: ["curl"], dnf: ["curl"] },
  unzip: { apt: ["unzip"], dnf: ["unzip"] },

  gcc: { apt: ["gcc"], dnf: ["gcc"] },
  "g++": { apt: ["g++"], dnf: ["gcc-c++"] },
  make: { apt: ["make"], dnf: ["make"] },
  python3: { apt: ["python3"], dnf: ["python3"] },
  "python3-pip": { apt: ["python3-pip"], dnf: ["python3-pip"] },
  "python3-dev": { apt: ["python3-dev"], dnf: ["python3-devel"] },
  "libpq-dev": { apt: ["libpq-dev"], dnf: ["libpq-devel"] },

  "vnc-server": {
    apt: ["tigervnc-standalone-server", "tightvncserver"],
    dnf: ["tigervnc-server"],
  },
  "vnc-common": { apt: ["tigervnc-common"], dnf: ["tigervnc-server"] },
  "x11-utils": { apt: ["x11-utils"], dnf: ["xorg-x11-utils"] },
  "x11-xserver-utils": {
    apt: ["x11-xserver-utils"],
    dnf: ["xorg-x11-server-utils"],
  },
  xterm: { apt: ["xterm"], dnf: ["xterm"] },
  "dbus-x11": { apt: ["dbus-x11"], dnf: ["dbus-x11"] },

  gtk3: { apt: ["libgtk-3-0", "libgtk-3-0t64"], dnf: ["gtk3"] },
  nss: { apt: ["libnss3"], dnf: ["nss"] },
  alsa: { apt: ["libasound2t64", "libasound2"], dnf: ["alsa-lib"] },
  libxtst: { apt: ["libxtst6"], dnf: ["libXtst"] },
  libxss: { apt: ["libxss1"], dnf: ["libXScrnSaver"] },
  "at-spi2": {
    apt: ["libatspi2.0-0", "libatspi2.0-0t64", "at-spi2-core"],
    dnf: ["at-spi2-core"],
  },
  libdrm: { apt: ["libdrm2"], dnf: ["libdrm"] },
  libgbm: { apt: ["libgbm1"], dnf: ["mesa-libgbm"] },
  libxkbcommon: { apt: ["libxkbcommon0"], dnf: ["libxkbcommon"] },
  libxdamage: { apt: ["libxdamage1"], dnf: ["libXdamage"] },
  libxcomposite: { apt: ["libxcomposite1"], dnf: ["libXcomposite"] },
  libxrandr: { apt: ["libxrandr2"], dnf: ["libXrandr"] },
  libxcursor: { apt: ["libxcursor1"], dnf: ["libXcursor"] },
  libxinerama: { apt: ["libxinerama1"], dnf: ["libXinerama"] },
  "cups-libs": { apt: ["libcups2", "libcups2t64"], dnf: ["cups-libs"] },
};

/**
 * Package ids the seed toolchain stage needs before anything else runs.
 *
 * This list is FATAL to the seed (`SEEDRUN-FAILED:toolchain-packages`), so every
 * dnf name in it must be one the AL2023 seed has already been installing for
 * months — nothing new goes here on a guess. `vnc-common` is the one addition
 * and its dnf side resolves to `tigervnc-server`, which was already present.
 * Optional tooling (`x11-xserver-utils` for xsetroot's cosmetic background)
 * lives in the soft-failing desktop-start install instead.
 */
export const CORE_TOOLCHAIN_PACKAGES = [
  "docker",
  "git",
  "jq",
  "gzip",
  "tar",
  "procps",
  "psmisc",
  "vnc-server",
  "vnc-common",
  "python3",
  "python3-pip",
  "x11-utils",
  "xterm",
  "dbus-x11",
  "gcc",
  "g++",
  "make",
] as const;

/** Shared libraries Chrome/Electron need on a headless X display. */
export const CHROME_RUNTIME_LIBRARY_PACKAGES = [
  "gtk3",
  "nss",
  "alsa",
  "libxtst",
  "libxss",
  "at-spi2",
  "libdrm",
  "libgbm",
  "libxkbcommon",
  "libxdamage",
  "libxcomposite",
  "libxrandr",
  "libxcursor",
  "libxinerama",
  "cups-libs",
] as const;

function assertKnown(ids: readonly string[]): readonly string[] {
  for (const id of ids) {
    if (!(id in PACKAGE_ALIASES)) {
      throw new Error(`Unknown sandbox package id: ${id}`);
    }
  }
  return ids;
}

function renderAliasCase(): string {
  const arms = Object.entries(PACKAGE_ALIASES).map(([id, byManager]) => {
    const apt = byManager.apt.join(" ");
    const dnf = byManager.dnf.join(" ");
    return `    ${id}) if [ "$2" = apt ]; then echo "${apt}"; else echo "${dnf}"; fi ;;`;
  });
  return ['  case "$1" in', ...arms, '    *) echo "$1" ;;', "  esac"].join(
    "\n",
  );
}

/** Log every install attempt to one file so a failed seed is diagnosable. */
export const PACKAGE_INSTALL_LOG = "/tmp/eva-pkg-install.log";

/**
 * Bash helper defining `eva_pkg_manager`, `eva_pkg_install`,
 * `eva_pkg_file_ext` / `eva_pkg_install_file`, `eva_pkg_install_chrome` and
 * `eva_pkg_install_gh`.
 *
 * Safe to emit more than once in the same shell (re-defining a function is a
 * no-op) and safe as a single element of a `join("; ")` array — the definition
 * ends with `}`, and `}; ` is valid bash.
 */
export const PACKAGE_HELPER_SCRIPT = [
  "eva_pkg_manager() {",
  "  if command -v apt-get >/dev/null 2>&1; then echo apt",
  "  elif command -v dnf >/dev/null 2>&1; then echo dnf",
  "  else echo none; fi",
  "}",
  "eva__pkg_candidates() {",
  renderAliasCase(),
  "}",
  "eva__pkg_apt_refresh() {",
  "  [ -f /tmp/.eva-apt-refreshed ] && return 0",
  `  sudo DEBIAN_FRONTEND=noninteractive apt-get update -y >>${PACKAGE_INSTALL_LOG} 2>&1 || true`,
  "  : > /tmp/.eva-apt-refreshed",
  "}",
  "eva__pkg_install_one() {",
  "  local mgr=$1 pkg=$2 cand",
  '  for cand in $(eva__pkg_candidates "$pkg" "$mgr"); do',
  '    if [ "$mgr" = apt ]; then',
  `      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$cand" >>${PACKAGE_INSTALL_LOG} 2>&1 && return 0`,
  "    else",
  `      sudo dnf install -y "$cand" >>${PACKAGE_INSTALL_LOG} 2>&1 && return 0`,
  "    fi",
  "  done",
  "  echo \"eva_pkg_install: no candidate installed for '$pkg' via $mgr\" >&2",
  "  return 1",
  "}",
  "eva_pkg_install() {",
  '  [ "$#" -gt 0 ] || return 0',
  '  local mgr pkg batch="" rc=0',
  "  mgr=$(eva_pkg_manager)",
  '  if [ "$mgr" = none ]; then echo "eva_pkg_install: no supported package manager" >&2; return 1; fi',
  '  [ "$mgr" = apt ] && eva__pkg_apt_refresh',
  '  for pkg in "$@"; do batch="$batch $(eva__pkg_candidates "$pkg" "$mgr" | awk \'{print $1}\')"; done',
  '  if [ "$mgr" = apt ]; then',
  `    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y $batch >>${PACKAGE_INSTALL_LOG} 2>&1 && return 0`,
  "  else",
  `    sudo dnf install -y $batch >>${PACKAGE_INSTALL_LOG} 2>&1 && return 0`,
  "  fi",
  '  for pkg in "$@"; do eva__pkg_install_one "$mgr" "$pkg" || rc=1; done',
  "  return $rc",
  "}",
  "eva_pkg_file_ext() {",
  '  if [ "$(eva_pkg_manager)" = apt ]; then echo deb; else echo rpm; fi',
  "}",
  "eva_pkg_install_file() {",
  "  local path=$1 mgr; mgr=$(eva_pkg_manager)",
  '  if [ "$mgr" = apt ]; then',
  `    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$path" >>${PACKAGE_INSTALL_LOG} 2>&1`,
  "  else",
  `    sudo rpm -Uvh "$path" >>${PACKAGE_INSTALL_LOG} 2>&1`,
  "  fi",
  "}",
  "eva_pkg_install_chrome() {",
  "  command -v google-chrome-stable >/dev/null 2>&1 && return 0",
  "  command -v chromium >/dev/null 2>&1 && return 0",
  "  command -v chromium-browser >/dev/null 2>&1 && return 0",
  "  local mgr; mgr=$(eva_pkg_manager)",
  '  if [ "$mgr" = apt ]; then',
  "    sudo install -d -m 0755 /etc/apt/keyrings",
  `    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg >>${PACKAGE_INSTALL_LOG} 2>&1 || true`,
  '    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null',
  "    rm -f /tmp/.eva-apt-refreshed",
  "    eva__pkg_apt_refresh",
  `    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y google-chrome-stable >>${PACKAGE_INSTALL_LOG} 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y chromium-browser >>${PACKAGE_INSTALL_LOG} 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y chromium >>${PACKAGE_INSTALL_LOG} 2>&1 || true`,
  "  else",
  "    sudo tee /etc/yum.repos.d/google-chrome.repo >/dev/null <<'EOF'",
  "[google-chrome]",
  "name=google-chrome",
  "baseurl=https://dl.google.com/linux/chrome/rpm/stable/x86_64",
  "enabled=1",
  "gpgcheck=1",
  "gpgkey=https://dl.google.com/linux/linux_signing_key.pub",
  "EOF",
  `    sudo dnf install -y google-chrome-stable >>${PACKAGE_INSTALL_LOG} 2>&1 || sudo dnf install -y chromium >>${PACKAGE_INSTALL_LOG} 2>&1 || true`,
  "  fi",
  "  command -v google-chrome-stable >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1",
  "}",
  "eva_pkg_install_gh() {",
  "  command -v gh >/dev/null 2>&1 && return 0",
  "  local mgr; mgr=$(eva_pkg_manager)",
  '  if [ "$mgr" = apt ]; then',
  "    sudo install -d -m 0755 /etc/apt/keyrings",
  `    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null 2>>${PACKAGE_INSTALL_LOG} || true`,
  "    sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg 2>/dev/null || true",
  '    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null',
  "    rm -f /tmp/.eva-apt-refreshed",
  "    eva__pkg_apt_refresh",
  `    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y gh >>${PACKAGE_INSTALL_LOG} 2>&1 || true`,
  "  else",
  `    sudo dnf install -y 'dnf-command(config-manager)' >>${PACKAGE_INSTALL_LOG} 2>&1 && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo >>${PACKAGE_INSTALL_LOG} 2>&1 && sudo dnf install -y gh --repo gh-cli >>${PACKAGE_INSTALL_LOG} 2>&1 || true`,
  "  fi",
  "  command -v gh >/dev/null 2>&1",
  "}",
].join("\n");

/** `eva_pkg_install a b c` — assumes PACKAGE_HELPER_SCRIPT is already in scope. */
export function pkgInstall(...ids: readonly string[]): string {
  return `eva_pkg_install ${assertKnown(ids).join(" ")}`;
}

/**
 * Self-contained install snippet: helper definitions plus the call. Use at exec
 * sites that run their own one-shot shell (the seed script defines the helper
 * once up front and uses `pkgInstall` instead).
 */
export function pkgInstallScript(...ids: readonly string[]): string {
  return `${PACKAGE_HELPER_SCRIPT}\n${pkgInstall(...ids)}`;
}
