/**
 * Pin local Convex backend binaries for Vercel sandboxes.
 *
 * Vercel Sandbox is Amazon Linux 2023 (glibc 2.34). Convex linux-gnu
 * precompiles from `precompiled-2026-07-15-*` onward require GLIBC_2.35
 * (`libm.so.6`), so `npx convex dev` dies before writing `CONVEX_DEPLOYMENT`.
 * Pin binary must be ≤ 2026-07-14 (ELF VERNEED max GLIBC_2.34).
 *
 * CarePulse uses anonymous mode, which rejects `--local-backend-version`. We
 * download a known-good binary and plant it into the CLI cache directory named
 * after "latest" so the cache hit serves our binary. The sandbox often gets
 * 403 from version.convex.dev (urllib), while the Convex CLI still resolves
 * latest successfully — so we always also plant under
 * EXPECTED_LATEST_CONVEX_LOCAL_BACKEND_VERSION.
 */
export const PINNED_CONVEX_LOCAL_BACKEND_VERSION =
  "precompiled-2026-07-14-7b3d1a5";

/** Cache label the CLI currently treats as latest (from version.convex.dev). */
export const EXPECTED_LATEST_CONVEX_LOCAL_BACKEND_VERSION =
  "precompiled-2026-07-21-82d5e9f";

const LINUX_X64_ARTIFACT = "convex-local-backend-x86_64-unknown-linux-gnu.zip";

/** True when the command likely starts or talks to a local Convex backend. */
export function isConvexBackendCommand(command: string): boolean {
  return /\bconvex\b/i.test(command);
}

/** Local backend health endpoint (anonymous mode serves the cloud API here). */
export const CONVEX_LOCAL_BACKEND_HEALTH_URL = "http://127.0.0.1:3210/version";

/**
 * Log line `convex dev` prints once functions are deployed and serving — the
 * readiness signal eva's native watcher greps for in `/tmp/bg-<i>.log`, so
 * repos no longer need hand-rolled grep loops in their startupCommands.
 */
export const CONVEX_FUNCTIONS_READY_LOG_LINE = "Convex functions ready";

/**
 * 5s polls the seed run spends waiting for that line before importing data.
 *
 * Bounded because the wait is non-fatal: a repo whose first push cannot
 * succeed until the seeds run never prints it, and pays the whole cap once
 * per build. 300s is well clear of an observed cold push (8s on cost-model-ts,
 * ~60s on CarePulse) while staying cheaper than the failed build it prevents.
 */
export const CONVEX_FUNCTIONS_READY_ATTEMPTS = 60;

function findLocalDeploymentConfig(repoDir: string): string {
  return `find ${repoDir} -name node_modules -prune -o -path "*/.convex/local/*/config.json" -print`;
}

function readLocalDeploymentField(field: string): string {
  return `python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))${field})' "$eva_cfg"`;
}

/**
 * Shell lines that push the repo's functions onto the already-running local
 * backend, for the seed script to run *after* its seed commands.
 *
 * The daemon's own first push fails on any repo whose `auth.config.ts` reads a
 * deployment env var: a fresh anonymous backend holds none until the seed
 * commands copy them across, and the CLI fails on the reference, not the read.
 * A repo cannot fix that with a second `npx convex dev --once` either — the CLI
 * refuses to start while the daemon owns the port ("A local backend is still
 * running on port 3210"). Pointing `--url`/`--admin-key` at the live backend
 * skips local-deployment management altogether, so the push just lands.
 *
 * The app directory is discovered from the local deployment config the daemon
 * wrote, which keeps this repo-agnostic. Tracing is off around the admin key so
 * it stays out of the stored build log; it is a loopback-only key, but free to
 * withhold. `repoDir` is the seed script's cwd.
 */
export function buildConvexPostSeedPushLines(repoDir: string): string[] {
  return [
    'echo "SEEDRUN-STAGE:convex-push"',
    `eva_cfg=$(${findLocalDeploymentConfig(repoDir)} 2>/dev/null | head -1)`,
    'if [ -z "$eva_cfg" ]; then',
    `  echo "convex-push: no local deployment config under ${repoDir}"`,
    '  echo "SEEDRUN-FAILED:convex-push"',
    "  exit 1",
    "else",
    `  eva_app=$(cd "$(dirname "$eva_cfg")/../../.." && pwd)`,
    `  eva_port=$(${readLocalDeploymentField('["ports"]["cloud"]')})`,
    "  { set +x; } 2>/dev/null",
    `  eva_key=$(${readLocalDeploymentField('["adminKey"]')})`,
    '  echo "convex-push: $eva_app -> http://127.0.0.1:$eva_port"',
    "  eva_pushed=0",
    "  for eva_try in 1 2 3; do",
    '    ( cd "$eva_app" && env -u CONVEX_AGENT_MODE npx convex dev --once --typecheck disable --url "http://127.0.0.1:$eva_port" --admin-key "$eva_key" ) && { eva_pushed=1; break; }',
    '    echo "convex-push: attempt $eva_try failed"',
    "    sleep 15",
    "  done",
    "  unset eva_key",
    "  set -x",
    '  [ "$eva_pushed" = 1 ] || { echo "SEEDRUN-FAILED:convex-push"; exit 1; }',
    "fi",
  ];
}

const CONVEX_DATA_BEFORE_SCHEMA_FLAG = "/tmp/eva-convex-data-before-schema";

const CONVEX_BACKEND_WATCHDOG_MISSES = 6;

/**
 * Shell lines that start a watchdog on the local backend for the rest of the
 * seed run, once the readiness gate has seen it healthy.
 *
 * The supervisor only restarts a backend that never came up. One that dies
 * later — mid-import on CarePulse eprocurement, every build since 2026-10-28 —
 * leaves `convex dev` retrying forever and the seed command blocked on it, so
 * the build only ends at the workflow timeout as "state: running", with the
 * cause scrolled out of the log tail. The watchdog writes the failure marker
 * (the poll step reads it at once), records memory and OOM evidence at the
 * moment of death, and kills the seed script. `$$` is the script's own PID.
 *
 * While healthy and until a schema is active, it also asks the backend whether
 * it holds documents with no schema. Then the first push must validate every
 * document and backfill every index at once — on eprocurement (1.1M documents)
 * that passed 14 GB of 16 and the kernel OOM-killed the backend. So an OOM kill
 * gets its cause in the marker:
 * - `convex-oom-before-schema`: data was loaded before the functions were pushed.
 * - `convex-backend-oom`: the schema was in place; the data needs more memory.
 */
export function buildConvexBackendWatchdogLines(repoDir: string): string[] {
  const query = (path: string) =>
    `curl -sf -m 10 -X POST "http://127.0.0.1:$eva_port/api/query" -H 'Content-Type: application/json' -H "Authorization: Convex $eva_key" -d '{"path":"${path}","args":[{}],"format":"json"}' 2>/dev/null`;
  return [
    "(",
    "  { set +x; } 2>/dev/null",
    "  eva_misses=0",
    "  eva_schema=0",
    `  eva_cfg=$(${findLocalDeploymentConfig(repoDir)} 2>/dev/null | head -1)`,
    `  [ -n "$eva_cfg" ] && eva_port=$(${readLocalDeploymentField('["ports"]["cloud"]')}) && eva_key=$(${readLocalDeploymentField('["adminKey"]')})`,
    "  while sleep 10; do",
    `    if curl -sf -m 10 ${CONVEX_LOCAL_BACKEND_HEALTH_URL} >/dev/null 2>&1; then`,
    "      eva_misses=0",
    '      if [ "$eva_schema" = 0 ] && [ -n "$eva_key" ]; then',
    `        if ${query("_system/frontend/getSchemas")} | grep -q '"active":"'; then`,
    "          eva_schema=1",
    `          rm -f ${CONVEX_DATA_BEFORE_SCHEMA_FLAG}`,
    `        elif [ ! -f ${CONVEX_DATA_BEFORE_SCHEMA_FLAG} ] && ${query("_system/frontend/tableSize:sizeOfAllTables")} | grep -qE '"value":[1-9]'; then`,
    `          touch ${CONVEX_DATA_BEFORE_SCHEMA_FLAG}`,
    '          echo "convex-watchdog: the backend holds documents but no schema; the first push will validate and index all of them at once"',
    "        fi",
    "      fi",
    "      continue",
    "    fi",
    "    eva_misses=$((eva_misses+1))",
    `    [ $eva_misses -lt ${CONVEX_BACKEND_WATCHDOG_MISSES} ] && continue`,
    '    echo "convex-watchdog: local backend stopped answering on :3210 during the seed run"',
    "    free -m 2>&1",
    "    sudo dmesg 2>/dev/null | grep -iE 'out of memory|killed process|oom' | tail -n 10",
    "    pgrep -a convex-local-backend 2>&1 || echo 'convex-watchdog: no convex-local-backend process'",
    "    if ! sudo dmesg 2>/dev/null | grep -q 'Killed process [0-9]* (convex-local-ba'; then",
    '      echo "SEEDRUN-FAILED:convex-backend-down"',
    `    elif [ -f ${CONVEX_DATA_BEFORE_SCHEMA_FLAG} ]; then`,
    '      echo "convex-watchdog: OOM-killed. The seed loaded data before any functions push, so the push validated and indexed every document at once. Fix the seed command: set env vars, push functions (convex dev --once), then import."',
    '      echo "SEEDRUN-FAILED:convex-oom-before-schema"',
    "    else",
    '      echo "convex-watchdog: OOM-killed with the schema in place; the data needs more memory than this sandbox has."',
    '      echo "SEEDRUN-FAILED:convex-backend-oom"',
    "    fi",
    "    kill -TERM $$ 2>/dev/null",
    "    exit 0",
    "  done",
    ") &",
    "eva_convex_watchdog=$!",
  ];
}

/** Stops the watchdog before stop commands shut the backend down on purpose. */
export const STOP_CONVEX_BACKEND_WATCHDOG_LINE =
  'kill "$eva_convex_watchdog" 2>/dev/null || true';

const CONVEX_LOCAL_BACKEND_WEDGE_LOG_LINE =
  "Unable to pull deployment config from http://127.0.0.1:3210";

function buildConvexSupervisorLines(command: string): string[] {
  return [
    `cat > "/tmp/eva-convex-bg-cmd-$$.sh" <<'EVA_CONVEX_BG_CMD'`,
    command,
    "EVA_CONVEX_BG_CMD",
    `eva_bg_log=$(readlink "/proc/$$/fd/1" 2>/dev/null || echo /dev/null)`,
    "eva_attempt=1",
    "while true; do",
    `  setsid bash -l "/tmp/eva-convex-bg-cmd-$$.sh" &`,
    "  eva_child=$!",
    '  eva_verdict=""',
    "  eva_waited=0",
    "  while [ $eva_waited -lt 300 ]; do",
    "    sleep 5; eva_waited=$((eva_waited+5))",
    '    kill -0 "$eva_child" 2>/dev/null || { eva_verdict=exited; break; }',
    `    curl -sf -m 3 ${CONVEX_LOCAL_BACKEND_HEALTH_URL} >/dev/null 2>&1 && { eva_verdict=healthy; break; }`,
    "  done",
    '  if [ "$eva_verdict" = healthy ]; then',
    '    echo "[eva-supervisor] local backend healthy after ${eva_waited}s"',
    '    wait "$eva_child" 2>/dev/null',
    "    exit 0",
    "  fi",
    '  if [ "$eva_verdict" = exited ]; then',
    "    if [ $eva_attempt -ge 3 ]; then",
    '      echo "[eva-supervisor] convex dev exited before backend healthy after 3 attempts"',
    "      exit 1",
    "    fi",
    '    echo "[eva-supervisor] convex dev exited before backend healthy — restarting (attempt $eva_attempt/3)"',
    "    eva_attempt=$((eva_attempt+1))",
    "    sleep 3",
    "    continue",
    "  fi",
    `  if ! grep -q "${CONVEX_LOCAL_BACKEND_WEDGE_LOG_LINE}" "$eva_bg_log" 2>/dev/null; then`,
    '    wait "$eva_child" 2>/dev/null',
    "    exit 0",
    "  fi",
    "  if [ $eva_attempt -ge 3 ]; then",
    '    echo "[eva-supervisor] local backend still down after 3 attempts; leaving convex dev running"',
    '    wait "$eva_child" 2>/dev/null',
    "    exit 0",
    "  fi",
    '  echo "[eva-supervisor] local backend not healthy after ${eva_waited}s — restarting convex dev (attempt $eva_attempt/3)"',
    '  kill -TERM -- "-$eva_child" 2>/dev/null || true',
    "  sleep 2",
    '  kill -KILL -- "-$eva_child" 2>/dev/null || true',
    "  pkill -KILL -f '[c]onvex-local-backend' 2>/dev/null || true",
    "  eva_attempt=$((eva_attempt+1))",
    "  sleep 3",
    "done",
  ];
}

/**
 * Shell script body for launching a Convex-related background command.
 *
 * Unsets CONVEX_AGENT_MODE, plants a glibc-compatible backend binary under the
 * CLI's "latest" cache label(s), aligns .convex config.json so non-TTY convex
 * dev skips auto-upgrade, then runs the original command under the self-heal
 * supervisor (see buildConvexSupervisorLines).
 */
export function buildConvexBackgroundScriptBody(command: string): string {
  const pinLiteral = JSON.stringify(PINNED_CONVEX_LOCAL_BACKEND_VERSION);
  const expectedLatestLiteral = JSON.stringify(
    EXPECTED_LATEST_CONVEX_LOCAL_BACKEND_VERSION,
  );
  const artifactLiteral = JSON.stringify(LINUX_X64_ARTIFACT);
  return [
    "unset CONVEX_AGENT_MODE",
    "find /tmp -maxdepth 1 -type d -name '.tmp*' -mmin +60 -exec rm -rf {} + 2>/dev/null || true",
    "python3 - <<'PY'",
    "import glob, json, os, pathlib, shutil, subprocess, tempfile, urllib.request, zipfile",
    `PIN = ${pinLiteral}`,
    `EXPECTED_LATEST = ${expectedLatestLiteral}`,
    `ARTIFACT = ${artifactLiteral}`,
    "CURL = ['curl', '-fSL', '--http1.1', '--retry', '5', '--retry-delay', '5', '--retry-all-errors']",
    "def download_release_asset(repo, tag, asset, output):",
    "  direct = f'https://github.com/{repo}/releases/download/{tag}/{asset}'",
    "  try:",
    "    subprocess.run(CURL + ['-o', output, direct], check=True)",
    "    return",
    "  except subprocess.CalledProcessError:",
    "    print('direct Convex release download failed; retrying through release asset API')",
    "  metadata = subprocess.check_output(",
    "    CURL + [f'https://api.github.com/repos/{repo}/releases/tags/{tag}'],",
    "    text=True,",
    "  )",
    "  release = json.loads(metadata)",
    "  asset_url = next((entry['url'] for entry in release['assets'] if entry['name'] == asset), None)",
    "  if asset_url is None:",
    "    raise RuntimeError(f'release {repo}@{tag} has no asset named {asset}')",
    "  subprocess.run(",
    "    CURL + ['-H', 'Accept: application/octet-stream', '-H', 'X-GitHub-Api-Version: 2022-11-28', '-o', output, asset_url],",
    "    check=True,",
    "  )",
    "def fetch_latest():",
    "  # Prefer curl — sandbox urllib often gets 403 from version.convex.dev.",
    "  try:",
    "    out = subprocess.check_output(",
    "      ['curl', '-fsSL', '-H', 'Convex-Client: npm-cli-1.40.0',",
    "       'https://version.convex.dev/v1/local_backend_version'],",
    "      text=True, timeout=30,",
    "    )",
    "    return json.loads(out)['version']",
    "  except Exception as e:",
    "    print(f'curl version api failed ({e})')",
    "  try:",
    "    req = urllib.request.Request(",
    "      'https://version.convex.dev/v1/local_backend_version',",
    "      headers={'Convex-Client': 'npm-cli-1.40.0', 'User-Agent': 'eva-sandbox-pin'},",
    "    )",
    "    with urllib.request.urlopen(req, timeout=30) as resp:",
    "      return json.load(resp)['version']",
    "  except Exception as e:",
    "    print(f'urllib version api failed ({e})')",
    "  return None",
    "fetched = fetch_latest()",
    "latest = fetched or EXPECTED_LATEST",
    "print(f'convex local backend: fetched={fetched} plant_as={latest} pin_binary={PIN}')",
    "labels = {PIN, EXPECTED_LATEST, latest}",
    "cache_roots = []",
    "for root in (",
    "  os.path.expanduser('~/.cache/convex/binaries'),",
    "  '/home/vercel-sandbox/.cache/convex/binaries',",
    "):",
    "  if root not in cache_roots:",
    "    cache_roots.append(root)",
    "def exec_path_of(dest_dir):",
    "  return os.path.join(dest_dir, 'convex-local-backend')",
    "def planted(dest_dir):",
    "  marker = os.path.join(dest_dir, '.eva-glibc-pin')",
    "  try:",
    "    return os.path.isfile(exec_path_of(dest_dir)) and os.path.isfile(marker) and open(marker).read().strip() == PIN",
    "  except Exception:",
    "    return False",
    "def plant_all(src, targets):",
    "  for dest_dir in targets:",
    "    try:",
    "      os.makedirs(dest_dir, exist_ok=True)",
    "      exec_path = exec_path_of(dest_dir)",
    "      shutil.copy2(src, exec_path)",
    "      os.chmod(exec_path, 0o755)",
    "      open(os.path.join(dest_dir, '.eva-glibc-pin'), 'w').write(PIN + '\\n')",
    "      print(f'planted {exec_path}')",
    "    except Exception as e:",
    "      print(f'skip cache {dest_dir}: {e}')",
    "dests = [os.path.join(root, label) for root in cache_roots for label in sorted(labels)]",
    "needed = [d for d in dests if not planted(d)]",
    "reuse = next((exec_path_of(d) for d in dests if planted(d)), None)",
    "if not needed:",
    "  print('all convex backend labels already planted; skipping download')",
    "elif reuse:",
    "  print(f'reusing planted binary {reuse}')",
    "  plant_all(reuse, needed)",
    "else:",
    "  url = f'https://github.com/get-convex/convex-backend/releases/download/{PIN}/{ARTIFACT}'",
    "  with tempfile.TemporaryDirectory() as td:",
    "    zpath = os.path.join(td, ARTIFACT)",
    "    print(f'downloading {url}')",
    "    download_release_asset('get-convex/convex-backend', PIN, ARTIFACT, zpath)",
    "    with zipfile.ZipFile(zpath) as zf:",
    "      zf.extractall(td)",
    "    matches = list(pathlib.Path(td).rglob('convex-local-backend'))",
    "    if not matches:",
    "      raise SystemExit(f'pin zip missing convex-local-backend: {os.listdir(td)}')",
    "    plant_all(str(matches[0]), needed)",
    "for p in glob.glob('/tmp/repo/**/.convex/**/config.json', recursive=True):",
    "  try:",
    "    with open(p) as f: cfg=json.load(f)",
    "    if cfg.get('backendVersion') == latest: continue",
    "    cfg['backendVersion']=latest",
    "    with open(p,'w') as f: json.dump(cfg,f)",
    "    print(f'aligned {p} -> {latest}')",
    "  except Exception as e:",
    "    print(f'skip {p}: {e}')",
    "PY",
    "eva_pin_status=$?",
    'if [ "$eva_pin_status" -ne 0 ]; then echo "[eva-supervisor] failed to plant glibc-compatible Convex backend"; exit "$eva_pin_status"; fi',
    ...buildConvexSupervisorLines(command),
  ].join("\n");
}
