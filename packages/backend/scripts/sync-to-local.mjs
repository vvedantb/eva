#!/usr/bin/env node
// Replaces a LOCAL Convex backend's data with a snapshot from a cloud deployment.
//
// Runs with no `convex login`:
//   Source auth — the deployment-scoped deploy key you pass is injected as
//   CONVEX_DEPLOY_KEY into the export child process. dotenv never overrides an
//   existing value and the deploy key is read before CONVEX_DEPLOYMENT, so the key
//   wins over whatever the app's .env.local holds.
//
//   Target auth — `--url` + `--admin-key`, read off the local deployment's
//   config.json. Those two flags together make the CLI skip every env var,
//   including auth (convex/src/cli/lib/deploymentSelection.ts,
//   `_getDeploymentSelection`), so the local backend is addressed directly.
//
// The import is `--replace-all`, so the target is guarded twice: the resolved URL
// must be loopback, and the backend must already answer on /instance_name.
//
// A snapshot carries documents, plus file storage with --include-storage. It does
// not carry env vars (hence --include-env), pending scheduled functions, or code.
//
// It also carries every installed component's tables, nested under `_components/`
// (checked 11 August 2026 against a dev export: actionCache, actionRetrier, crons,
// migrations, presence, prosemirrorSync, timeline, workflow), and a component that
// installs another nests again — `_components/workflow/_components/workpool/…`.
// One whole-zip import of that fails with "New table `X` in '<component>' has IDs
// that conflict with existing system table": the component namespaces are addressed
// by name, not by the zip's layout. So the zip is split — the root tables stay in
// the original zip, and each component subtree becomes its own zip imported with
// `--component <path>`, where `<path>` is the component tree path the CLI expects
// (`workflow`, `workflow/workpool`). Parents import before their children.
// --skip-components drops `_components/**` instead, as an escape hatch.
//
// Snapshots hold real client data. The zip is deleted after a successful import
// unless --keep-snapshot, and backups/ is gitignored. Never commit or share one.
//
//   node scripts/sync-to-local.mjs --deploy-key-file ../eva-prod.key
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// Apps this script can sync, as paths relative to the directory above `scripts/`.
// Cross-repo sharing would need a published package, so this file is a deliberate
// near-copy of carepulse-ts's scripts/sync-to-local.mjs. Only this block, the usage
// example above, and each repo's prettier formatting differ — keep any fix
// appliable to both by diffing them.
const APPS = {
  backend: ".",
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const isWindows = process.platform === "win32";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const appNames = Object.keys(APPS);

const USAGE = `
Sync a cloud Convex deployment into the local Convex backend.

  node scripts/sync-to-local.mjs --app <${appNames.join("|")}> --deploy-key-file <path>

  --app <name>              Which app to sync${appNames.length === 1 ? ` (default: ${appNames[0]})` : `: ${appNames.join(", ")}`}.
  --deploy-key-file <path>  File holding the source deployment's deploy key.
  --deploy-key <key>        Same key inline. Falls back to CONVEX_SOURCE_DEPLOY_KEY.
  --include-storage         Also export file storage. Off by default: slow and large.
  --include-env             Copy the source deployment's env vars onto the local one.
  --skip-components         Do not import component data at all. Off by default:
                            each component subtree is imported with --component.
  --local-url <url>         Override the target URL (must be loopback).
  --local-admin-key <key>   Override the target admin key. Required with --local-url.
  --out <path>              Where to write the snapshot zip (default: backups/).
  --keep-snapshot           Keep the snapshot zip instead of deleting it.
`;

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      app: { type: "string" },
      "deploy-key": { type: "string" },
      "deploy-key-file": { type: "string" },
      "include-storage": { type: "boolean", default: false },
      "include-env": { type: "boolean", default: false },
      "skip-components": { type: "boolean", default: false },
      "local-url": { type: "string" },
      "local-admin-key": { type: "string" },
      out: { type: "string" },
      "keep-snapshot": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  }));
} catch (error) {
  fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

// --- app ---------------------------------------------------------------------

const appName = values.app ?? (appNames.length === 1 ? appNames[0] : undefined);
if (appName === undefined) {
  fail(`Pass --app with one of: ${appNames.join(", ")}`);
}
if (!Object.hasOwn(APPS, appName)) {
  fail(`Unknown --app "${appName}". Valid values: ${appNames.join(", ")}`);
}
const appDir = join(rootDir, APPS[appName]);
if (!existsSync(appDir)) {
  fail(`App directory not found: ${appDir}`);
}

// --- source key --------------------------------------------------------------

function readSourceKey() {
  if (values["deploy-key-file"] !== undefined) {
    const keyPath = resolve(values["deploy-key-file"]);
    if (!existsSync(keyPath)) {
      fail(`Deploy key file not found: ${keyPath}`);
    }
    return readFileSync(keyPath, "utf8").trim();
  }
  if (values["deploy-key"] !== undefined) {
    return values["deploy-key"].trim();
  }
  if (process.env.CONVEX_SOURCE_DEPLOY_KEY) {
    return process.env.CONVEX_SOURCE_DEPLOY_KEY.trim();
  }
  return fail(
    "No source deploy key. Pass --deploy-key-file <path>, --deploy-key <key>, or set CONVEX_SOURCE_DEPLOY_KEY.\n" +
      "Generate one in the Convex dashboard: the source deployment -> Settings -> Deploy keys.",
  );
}

const sourceKey = readSourceKey();
const keyPrefix = sourceKey.slice(0, sourceKey.indexOf("|"));

// A deployment-scoped key names its own deployment, which is the whole point: the
// key alone picks the source, so no deployment name is hardcoded here and no
// selector flag can redirect the export. Project and preview keys do not name one.
if (!/^(dev|prod):[^|]+$/.test(keyPrefix)) {
  const kind = sourceKey.startsWith("project:")
    ? "a project deploy key"
    : sourceKey.startsWith("preview:")
      ? "a preview deploy key"
      : "not a deployment deploy key";
  fail(
    `The source key is ${kind}, which does not name a single deployment.\n` +
      "Pass a deployment-scoped key (it starts with `dev:` or `prod:`, e.g. `prod:brave-tapir-123|...`)\n" +
      "from the Convex dashboard: the source deployment -> Settings -> Deploy keys.",
  );
}
const sourceName = keyPrefix.slice(keyPrefix.indexOf(":") + 1);

// --- local target ------------------------------------------------------------

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function targetFromLocalConfig(configPath) {
  const config = readJsonFile(configPath);
  if (config === null) {
    return null;
  }
  const port = config.ports?.cloud;
  const adminKey = config.adminKey;
  if (typeof port !== "number" || typeof adminKey !== "string") {
    return fail(
      `${configPath} does not look like a local deployment config (expected ports.cloud and adminKey).`,
    );
  }
  return {
    url: `http://127.0.0.1:${port}`,
    adminKey,
    name:
      typeof config.deploymentName === "string"
        ? config.deploymentName
        : "local",
    from: configPath,
  };
}

/** The deployment name in the app's .env.local, without its `dev:` / `anonymous:` prefix. */
function configuredDeploymentName() {
  const envPath = join(appDir, ".env.local");
  if (!existsSync(envPath)) {
    return null;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*CONVEX_DEPLOYMENT\s*=\s*"?([^"#\s]+)"?/.exec(line);
    if (match !== null) {
      return match[1].replace(/^[a-z]+:/, "");
    }
  }
  return null;
}

function resolveTarget() {
  const url = values["local-url"];
  const adminKey = values["local-admin-key"];
  if (url !== undefined || adminKey !== undefined) {
    if (url === undefined || adminKey === undefined) {
      return fail("--local-url and --local-admin-key must be passed together.");
    }
    return { url, adminKey, name: "override", from: "--local-url" };
  }

  // Where `npx convex dev` puts a local deployment's credentials.
  const projectLocal = targetFromLocalConfig(
    join(appDir, ".convex", "local", "default", "config.json"),
  );
  if (projectLocal !== null) {
    return projectLocal;
  }

  // Older CLI versions kept anonymous deployment state under the home directory.
  const deploymentName = configuredDeploymentName();
  if (deploymentName !== null) {
    const legacy = targetFromLocalConfig(
      join(
        homedir(),
        ".convex",
        "anonymous-convex-backend-state",
        deploymentName,
        "config.json",
      ),
    );
    if (legacy !== null) {
      return legacy;
    }
  }

  return fail(
    `No local Convex deployment found for ${appName}.\n` +
      `Start one first: cd ${appDir} && npx convex dev (while logged out of the Convex CLI),\n` +
      "then leave it running and re-run this script.\n" +
      "If the app's .env.local sets CONVEX_DEPLOY_KEY, comment it out first or `convex dev` will target that cloud deployment instead.",
  );
}

const target = resolveTarget();

// The import is destructive, so refuse anything that is not this machine.
let targetHost;
try {
  targetHost = new URL(target.url).hostname;
} catch {
  fail(`Target URL is not a valid URL: ${target.url}`);
}
if (!LOOPBACK_HOSTS.has(targetHost)) {
  fail(
    `Refusing to run: the target (${target.url}) is not a local backend.\n` +
      "This script only ever imports into 127.0.0.1 / localhost.",
  );
}

// A storage export can take a long time; check the target is up before starting.
// 15s rather than 5s: a backend under load — a sandbox VM, or `convex dev` in the
// middle of a push — can be slow to answer without being down.
try {
  const response = await fetch(`${target.url}/instance_name`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    fail(`${target.url}/instance_name returned ${response.status}.`);
  }
} catch (error) {
  fail(
    `No Convex backend answering at ${target.url} (${error instanceof Error ? error.message : String(error)}).\n` +
      `Start it with: cd ${appDir} && npx convex dev`,
  );
}

// --- run ---------------------------------------------------------------------

/** cmd.exe reads an unquoted `|` in an admin key as a pipe, so quote every argument. */
function quoteForShell(arg) {
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function runConvex(args, options) {
  const {
    label,
    env = {},
    secrets = [],
    capture = false,
    input,
    unset = [],
    allowFailure = false,
    // Extra attempts for idempotent calls: a local backend that is still
    // pushing functions answers some writes with a transient 503
    // (OptimisticConcurrencyControlFailure), which aborted whole seeds.
    retries = 0,
  } = options;

  let printable = ["convex", ...args].join(" ");
  for (const secret of secrets) {
    printable = printable.split(secret).join("***");
  }
  console.log(`\n[${label}] npx ${printable}`);

  // Only the source export gets a deploy key, and only from `env` below.
  const childEnv = { ...process.env };
  delete childEnv.CONVEX_DEPLOY_KEY;
  for (const name of unset) {
    delete childEnv[name];
  }
  Object.assign(childEnv, env);

  const spawnOnce = () =>
    spawnSync(
      isWindows ? "npx.cmd" : "npx",
      isWindows ? ["convex", ...args].map(quoteForShell) : ["convex", ...args],
      {
        cwd: appDir,
        env: childEnv,
        stdio: [
          input === undefined ? "inherit" : "pipe",
          capture ? "pipe" : "inherit",
          "inherit",
        ],
        input,
        shell: isWindows,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  let result = spawnOnce();
  for (
    let attempt = 1;
    attempt <= retries && !result.error && result.status !== 0;
    attempt++
  ) {
    console.log(`[${label}] retrying (${attempt}/${retries})`);
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0,
      0,
      2000 * attempt,
    );
    result = spawnOnce();
  }
  if (result.error) {
    fail(`[${label}] could not start npx: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (allowFailure) {
      return null;
    }
    fail(`[${label}] failed; aborting.`);
  }
  return capture ? (result.stdout ?? "") : "";
}

// Rewrite the snapshot zip to hold only the root tables, and in "split" mode carve
// each component subtree out into its own zip that `--component` can import.
//
// python does the rewriting because it can copy a member without re-compressing it
// (writestr honours the ZipInfo's compress_type), so file-storage blobs are moved
// byte-for-byte. `zip -d` is deliberately not used: its wildcard-vs-`/` behaviour is
// ambiguous and would strip a nested component tree only partially.
//
// Leading `_components/<name>` pairs are consumed to build the component path, so a
// parent's zip never swallows its child's entries and nesting maps straight onto the
// CLI's path form: `_components/workflow/_components/workpool/globals/documents.jsonl`
// becomes `globals/documents.jsonl` in the zip for component `workflow/workpool`.
const SPLIT_PY = [
  "import sys, os, zipfile",
  "src, out_dir, mode = sys.argv[1], sys.argv[2], sys.argv[3]",
  "def split_name(name):",
  "    parts = name.split('/')",
  "    comp, i = [], 0",
  "    while i + 1 < len(parts) and parts[i] == '_components':",
  "        comp.append(parts[i + 1])",
  "        i += 2",
  "    return '/'.join(comp), '/'.join(parts[i:])",
  "root_tmp = src + '.root'",
  "buckets = {}",
  "stats = {'component': 0, 'storage': 0, 'root': 0}",
  "with zipfile.ZipFile(src) as zin:",
  "    with zipfile.ZipFile(root_tmp, 'w', zipfile.ZIP_DEFLATED) as zout:",
  "        for info in zin.infolist():",
  "            path, rest = split_name(info.filename)",
  "            if not info.is_dir():",
  "                stats['component' if path else 'root'] += 1",
  "                if not path and info.filename.startswith('_storage/'):",
  "                    stats['storage'] += 1",
  "            if not path:",
  "                zout.writestr(info, zin.read(info.filename))",
  "            elif mode == 'split' and rest:",
  "                buckets.setdefault(path, []).append((info, rest))",
  // Shallowest first, so a parent component is imported before its children.
  "    for path in sorted(buckets, key=lambda p: (p.count('/'), p)):",
  "        target = os.path.join(out_dir, 'component-' + path.replace('/', '__') + '.zip')",
  "        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as zc:",
  "            for info, rest in buckets[path]:",
  "                inner = zipfile.ZipInfo(rest, date_time=info.date_time)",
  "                inner.compress_type = info.compress_type",
  "                zc.writestr(inner, zin.read(info.filename))",
  "        print('COMPONENT\\t' + path + '\\t' + target + '\\t' + str(len(buckets[path])))",
  "os.replace(root_tmp, src)",
  "print('SUMMARY\\t%d\\t%d\\t%d' % (stats['component'], stats['storage'], stats['root']))",
].join("\n");

/** @returns {{path: string, zip: string}[]} component zips to import, in order. */
function splitComponents(zip, outDir, mode) {
  console.log(
    `\n[${mode} components] rewriting the snapshot (mode: ${mode === "split" ? "import each component separately" : "drop component data"})`,
  );
  for (const python of ["python3", "python"]) {
    const res = spawnSync(python, ["-c", SPLIT_PY, zip, outDir, mode], {
      stdio: ["ignore", "pipe", "inherit"],
      shell: isWindows,
      encoding: "utf8",
    });
    if (res.error || res.status !== 0) {
      continue;
    }
    const lines = (res.stdout ?? "").split(/\r?\n/);
    const components = lines
      .filter((line) => line.startsWith("COMPONENT\t"))
      .map((line) => {
        const [, path, componentZip, entries] = line.split("\t");
        console.log(
          `  component ${path}: ${entries} entries -> ${componentZip}`,
        );
        return { path, zip: componentZip };
      });

    // A successful snapshot build keeps no seed log, so silence has to be made
    // impossible rather than merely unlikely: without this, an export that carried
    // no component data at all would split into nothing, import nothing, and still
    // go green.
    const summary = lines.find((line) => line.startsWith("SUMMARY\t"));
    if (summary === undefined) {
      fail(
        "The split script printed no summary; cannot tell what the snapshot held.",
      );
    }
    const [, componentEntries, storageEntries, rootEntries] =
      summary.split("\t");
    console.log(
      `  snapshot holds ${rootEntries} root entries (${storageEntries} file-storage) ` +
        `and ${componentEntries} component entries`,
    );
    if (
      mode === "split" &&
      Number(componentEntries) > 0 &&
      components.length === 0
    ) {
      fail(
        `The snapshot holds ${componentEntries} component entries but none were split out.\n` +
          "Importing now would silently drop every component's data.",
      );
    }
    if (values["include-storage"] && Number(storageEntries) === 0) {
      console.log(
        "  WARNING: --include-storage was passed but the snapshot holds no _storage entries.",
      );
    }
    return components;
  }
  return fail(
    "Could not split _components/** out of the snapshot: python3 is not available.\n" +
      "Install python3, or pass --skip-components to drop component data instead.",
  );
}

const zipPath =
  values.out === undefined
    ? join(appDir, "backups", `${appName}-${sourceName}.zip`)
    : resolve(values.out);

console.log(`Syncing ${appName}`);
console.log(`  source: ${sourceName} (from the deploy key)`);
console.log(`  target: ${target.url} — ${target.name} (${target.from})`);
console.log(
  `  file storage: ${values["include-storage"] ? "included" : "skipped"}`,
);
console.log(`  env vars: ${values["include-env"] ? "copied" : "left alone"}`);
console.log(
  `  components: ${values["skip-components"] ? "skipped" : "imported one at a time, with --component"}`,
);
console.log(`  snapshot: ${zipPath}`);

mkdirSync(dirname(zipPath), { recursive: true });
rmSync(zipPath, { force: true });

const exportArgs = ["export", "--path", zipPath];
if (values["include-storage"]) {
  exportArgs.push("--include-file-storage");
}
runConvex(exportArgs, {
  label: `export ${sourceName}`,
  env: { CONVEX_DEPLOY_KEY: sourceKey },
  secrets: [sourceKey],
});

const componentZips = splitComponents(
  zipPath,
  dirname(zipPath),
  values["skip-components"] ? "strip" : "split",
);

const targetFlags = ["--url", target.url, "--admin-key", target.adminKey];

// Root tables first, and only here is --replace-all right: it clears tables the
// snapshot omits, which is what makes the local deployment a mirror rather than a
// merge. The component imports below must not repeat the flag — see there.
runConvex(["import", ...targetFlags, "--replace-all", "--yes", zipPath], {
  label: `import into ${target.name}`,
  secrets: [target.adminKey],
});

// Env vars before the component imports: a repo whose auth.config.ts reads one
// cannot be pushed until they exist, and pushing is how the components get
// installed (see installComponents).
if (values["include-env"]) {
  // There is no bulk env import: `env set` takes one `<name>` and reads its value
  // from stdin (convex/src/cli/env.ts). `env list` prints `NAME=value` with values
  // raw and unquoted, so a multi-line value — a PEM key — spans lines and cannot be
  // split back out of that dump reliably. Take only the names from it, then read
  // each value with `env get`, whose entire stdout is the value.
  // Values move over stdin, so none is written to disk, logged, or put in argv.
  const dump = runConvex(["env", "list"], {
    label: `env list ${sourceName}`,
    env: { CONVEX_DEPLOY_KEY: sourceKey },
    secrets: [sourceKey],
    capture: true,
  });
  const names = [
    ...new Set(
      dump.split(/\r?\n/).flatMap((line) => {
        const match = /^([A-Z_][A-Za-z0-9_]*)=/.exec(line);
        // CONVEX_* are backend-managed and cannot be set.
        return match === null || match[1].startsWith("CONVEX_")
          ? []
          : [match[1]];
      }),
    ),
  ];
  if (names.length === 0) {
    console.log("\nSource has no environment variables; nothing to copy.");
  } else {
    for (const name of names) {
      // `env get` prints the value then a newline, so one trailing newline is the
      // CLI's, not the value's. A value that genuinely ends in a newline loses it.
      const value = runConvex(["env", "get", name], {
        label: `env get ${name}`,
        env: { CONVEX_DEPLOY_KEY: sourceKey },
        secrets: [sourceKey],
        capture: true,
      }).replace(/\r?\n$/, "");
      runConvex(
        [
          "env",
          "set",
          "--url",
          target.url,
          "--admin-key",
          target.adminKey,
          name,
        ],
        {
          label: `env set ${name} on ${target.name}`,
          secrets: [target.adminKey],
          input: value,
          retries: 3,
        },
      );
    }
    console.log(`\nCopied ${names.length} env var(s): ${names.join(", ")}`);
    console.log(
      "These are the source deployment's secrets; they now live on this machine.",
    );
  }
}

// A component's tables only exist once its code is installed, and an import into a
// namespace the backend has never seen fails with "New table `<name>` in
// '<component>' has IDs that conflict with existing system table". Pushing installs
// them. It is done lazily, on the first component that needs it, because a backend
// a `convex dev` daemon has already pushed to needs nothing: --url plus --admin-key
// address the running backend directly, so this does not fight the daemon for the
// port. One push serves every component.
let pushed = false;
function installComponents() {
  if (pushed) {
    return;
  }
  pushed = true;
  runConvex(["dev", "--once", "--typecheck", "disable", ...targetFlags], {
    label: `push functions to ${target.name} (installs components)`,
    secrets: [target.adminKey],
    // Anonymous mode (what a sandbox's own `convex dev` daemon runs under) makes
    // the CLI manage its own local deployment instead of using --url.
    unset: ["CONVEX_AGENT_MODE"],
  });
}

// --replace, not --replace-all: --replace-all is deployment-wide even alongside
// --component, so it also clears every ROOT table not present in the component's
// zip — which is all of them. That silently undid the root import above (the
// change summary read "githubRepos 0 create / 17 of 17 delete"), leaving every
// seeded sandbox with an empty app database. --replace only replaces the tables
// the component zip actually carries.
for (const component of componentZips) {
  const args = [
    "import",
    ...targetFlags,
    "--component",
    component.path,
    "--replace",
    "--yes",
    component.zip,
  ];
  const label = `import component ${component.path}`;
  if (
    runConvex(args, {
      label,
      secrets: [target.adminKey],
      allowFailure: true,
    }) === null
  ) {
    console.log(`\n[${label}] failed — installing components, then retrying`);
    installComponents();
    runConvex(args, { label: `${label} (retry)`, secrets: [target.adminKey] });
  }
  if (!values["keep-snapshot"]) {
    rmSync(component.zip, { force: true });
  }
}

if (values["keep-snapshot"]) {
  console.log(
    `\nSnapshot kept at ${zipPath} — it holds real data, do not commit or share it.`,
  );
} else {
  rmSync(zipPath, { force: true });
}

console.log(
  `\nDone. ${target.name} (${target.url}) now mirrors ${sourceName}.`,
);
