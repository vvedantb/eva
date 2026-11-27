#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadSandboxEnv, resolveSandboxEnv } from "./sandbox-env.mjs";

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
  --sandbox-env             Set only the vars .eva/sandbox-env.json allows for this
                            app, and remove every other one (an Eva sandbox).
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
      "sandbox-env": { type: "boolean", default: false },
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
if (values["include-env"] && values["sandbox-env"]) {
  fail("Pass --include-env or --sandbox-env, not both.");
}

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

  const projectLocal = targetFromLocalConfig(
    join(appDir, ".convex", "local", "default", "config.json"),
  );
  if (projectLocal !== null) {
    return projectLocal;
  }

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
  } = options;

  let printable = ["convex", ...args].join(" ");
  for (const secret of secrets) {
    printable = printable.split(secret).join("***");
  }
  console.log(`\n[${label}] npx ${printable}`);

  const childEnv = { ...process.env };
  delete childEnv.CONVEX_DEPLOY_KEY;
  for (const name of unset) {
    delete childEnv[name];
  }
  Object.assign(childEnv, env);

  const result = spawnSync(
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
  "import json",
  "LIVE_TURN = {'staged', 'launching', 'running', 'finalizing'}",
  "settled = {}",
  "def settle(table, doc):",
  "    if table == 'sessions' and doc.get('status') != 'closed':",
  "        doc['status'] = 'closed'",
  "    elif table == 'turns' and (doc.get('state') in LIVE_TURN or doc.get('open')):",
  "        doc['state'], doc['open'] = 'done', False",
  "    elif table == 'agentRuns' and doc.get('status') in ('queued', 'running'):",
  "        doc['status'] = 'cancelled'",
  "    elif table == 'agentTasks' and 'run' in doc:",
  "        del doc['run']",
  "    elif table == 'projects' and ('activeWorkflowId' in doc or 'interviewSandboxClaim' in doc):",
  "        doc.pop('activeWorkflowId', None)",
  "        doc.pop('interviewSandboxClaim', None)",
  "    else:",
  "        return False",
  "    settled[table] = settled.get(table, 0) + 1",
  "    return True",
  "def settle_file(name, data):",
  "    table, _, file = name.partition('/')",
  "    if file != 'documents.jsonl' or table not in ('sessions', 'turns', 'agentRuns', 'agentTasks', 'projects'):",
  "        return data",
  "    out = []",
  "    for line in data.decode('utf-8').split('\\n'):",
  "        if not line.strip():",
  "            continue",
  "        doc = json.loads(line)",
  "        out.append(json.dumps(doc, ensure_ascii=False) if settle(table, doc) else line)",
  "    return ('\\n'.join(out) + '\\n').encode('utf-8')",
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
  "                zout.writestr(info, settle_file(info.filename, zin.read(info.filename)))",
  "            elif mode == 'split' and rest:",
  "                buckets.setdefault(path, []).append((info, rest))",
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
  "for table in sorted(settled):",
  "    print('SETTLED\\t' + table + '\\t' + str(settled[table]))",
].join("\n");

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
    if (res.error) {
      continue;
    }
    if (res.status !== 0) {
      return fail(
        `The split script failed under ${python} (exit ${res.status}).`,
      );
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

    for (const line of lines.filter((l) => l.startsWith("SETTLED\t"))) {
      const [, table, count] = line.split("\t");
      console.log(
        `  settled ${count} live ${table} row(s) (see settle() above)`,
      );
    }
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
console.log(
  `  env vars: ${values["include-env"] ? "copied" : values["sandbox-env"] ? "sandbox allowlist" : "left alone"}`,
);
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

const sourceAuth = {
  env: { CONVEX_DEPLOY_KEY: sourceKey },
  secrets: [sourceKey],
};
const targetAuth = { secrets: [target.adminKey] };

let namesOnlyFlag;
function supportsNamesOnly() {
  if (namesOnlyFlag === undefined) {
    const cliVersion = runConvex(["--version"], {
      label: "convex CLI version",
      capture: true,
    }).trim();
    const versionMatch = /(\d+)\.(\d+)\.(\d+)/.exec(cliVersion);
    if (versionMatch === null) {
      fail(`Could not read the Convex CLI version from: ${cliVersion}`);
    }
    const [major, minor] = versionMatch.slice(1).map(Number);
    namesOnlyFlag = major > 1 || (major === 1 && minor >= 42);
  }
  return namesOnlyFlag;
}

function listEnvNames(label, flags, auth) {
  const namesOnly = supportsNamesOnly();
  const dump = runConvex(
    ["env", "list", ...flags, ...(namesOnly ? ["--names-only"] : [])],
    { label, ...auth, capture: true },
  );
  const nameLine = namesOnly
    ? /^([A-Z_][A-Za-z0-9_]*)$/
    : /^([A-Z_][A-Za-z0-9_]*)=/;
  return [
    ...new Set(
      dump.split(/\r?\n/).flatMap((line) => {
        const match = nameLine.exec(namesOnly ? line.trim() : line);
        return match === null || match[1].startsWith("CONVEX_")
          ? []
          : [match[1]];
      }),
    ),
  ];
}

function readSourceEnv(name) {
  return runConvex(["env", "get", name], {
    label: `env get ${name}`,
    ...sourceAuth,
    capture: true,
  }).replace(/\r?\n$/, "");
}

function setTargetEnv(name, value) {
  runConvex(["env", "set", ...targetFlags, name], {
    label: `env set ${name} on ${target.name}`,
    ...targetAuth,
    input: value,
  });
}

if (values["include-env"]) {
  const names = listEnvNames(`env list ${sourceName}`, [], sourceAuth);
  if (names.length === 0) {
    console.log("\nSource has no environment variables; nothing to copy.");
  } else {
    for (const name of names) setTargetEnv(name, readSourceEnv(name));
    console.log(`\nCopied ${names.length} env var(s): ${names.join(", ")}`);
    console.log(
      "These are the source deployment's secrets; they now live on this machine.",
    );
  }
}

if (values["sandbox-env"]) {
  const rules = loadSandboxEnv(appDir);
  const { values: env, missing } = await resolveSandboxEnv(
    rules,
    readSourceEnv,
  );
  for (const [name, value] of env) setTargetEnv(name, value);
  const stale = listEnvNames(
    `env list ${target.name}`,
    targetFlags,
    targetAuth,
  ).filter((name) => !env.has(name));
  for (const name of stale) {
    runConvex(["env", "remove", ...targetFlags, name], {
      label: `env remove ${name} on ${target.name}`,
      ...targetAuth,
    });
  }
  const unlisted = listEnvNames(
    `env list ${sourceName}`,
    [],
    sourceAuth,
  ).filter((name) => !Object.hasOwn(rules, name));
  console.log(
    `\nSet ${env.size} sandbox env var(s): ${[...env.keys()].join(", ")}`,
  );
  if (stale.length > 0) console.log(`Removed: ${stale.join(", ")}`);
  if (missing.length > 0) {
    console.warn(
      `\nUNSET: add a test value as an Eva env var (Seed only), then reseed: ${missing.join(", ")}`,
    );
  }
  if (unlisted.length > 0) {
    console.warn(
      `\nNOT COPIED: source vars missing from .eva/sandbox-env.json: ${unlisted.join(", ")}`,
    );
  }
}

let pushed = false;
function installComponents() {
  if (pushed) {
    return;
  }
  pushed = true;
  runConvex(["dev", "--once", "--typecheck", "disable", ...targetFlags], {
    label: `push functions to ${target.name} (installs components)`,
    secrets: [target.adminKey],
    unset: ["CONVEX_AGENT_MODE"],
  });
}

const emptyZip = join(dirname(zipPath), `${appName}-empty.zip`);
const EMPTY_PY = [
  "import sys, zipfile",
  "with zipfile.ZipFile(sys.argv[1]) as zin, zipfile.ZipFile(sys.argv[2], 'w') as zout:",
  "    for info in zin.infolist():",
  "        if info.filename.endswith('documents.jsonl'):",
  "            zout.writestr(info.filename, '')",
  "        elif not info.filename.startswith('_storage/'):",
  "            zout.writestr(info, zin.read(info.filename))",
].join("\n");
let emptied = false;
for (const python of ["python3", "python"]) {
  const res = spawnSync(python, ["-c", EMPTY_PY, zipPath, emptyZip], {
    stdio: ["ignore", "inherit", "inherit"],
    shell: isWindows,
  });
  if (res.error) {
    continue;
  }
  if (res.status !== 0) {
    fail(`Building the empty snapshot failed under ${python} (exit ${res.status}).`);
  }
  emptied = true;
  break;
}
if (!emptied) {
  fail("python3 or python is required to build the empty snapshot.");
}
runConvex(["import", ...targetFlags, "--replace-all", "--yes", emptyZip], {
  label: `empty ${target.name}`,
  secrets: [target.adminKey],
});
rmSync(emptyZip, { force: true });

installComponents();

runConvex(["import", ...targetFlags, "--replace-all", "--yes", zipPath], {
  label: `import into ${target.name}`,
  secrets: [target.adminKey],
});

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
