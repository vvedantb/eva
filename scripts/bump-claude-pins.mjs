
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = join(repoRoot, "packages/backend");

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
const CLI_PACKAGE = "@anthropic-ai/claude-code";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.inherit === true ? "inherit" : "pipe",
    ...options,
  });
}

function latestPair() {
  const sdkVersion = run("npm", [
    "view",
    `${SDK_PACKAGE}@latest`,
    "version",
  ]).trim();
  const cliVersion = run("npm", [
    "view",
    `${SDK_PACKAGE}@latest`,
    "claudeCodeVersion",
  ]).trim();
  if (
    !/^\d+\.\d+\.\d+$/.test(sdkVersion) ||
    !/^\d+\.\d+\.\d+$/.test(cliVersion)
  ) {
    throw new Error(
      `${SDK_PACKAGE}@latest gave version "${sdkVersion}" / claudeCodeVersion "${cliVersion}"`,
    );
  }
  const cliPublished = run("npm", [
    "view",
    `${CLI_PACKAGE}@${cliVersion}`,
    "version",
  ]).trim();
  if (cliPublished !== cliVersion) {
    throw new Error(
      `${CLI_PACKAGE}@${cliVersion} is not published (npm returned "${cliPublished}")`,
    );
  }
  return { sdkVersion, cliVersion };
}

function replaceOnce(path, find, replace) {
  const absolute = join(repoRoot, path);
  const before = readFileSync(absolute, "utf8");
  const occurrences = before.split(find).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `${path}: expected exactly one occurrence of ${JSON.stringify(find)}, found ${occurrences}`,
    );
  }
  writeFileSync(absolute, before.replace(find, replace), "utf8");
}

function currentPins() {
  const cliModule = readFileSync(
    join(backendRoot, "convex/_sandbox_runtime/claudeCliVersion.ts"),
    "utf8",
  );
  const sdkLoader = readFileSync(
    join(backendRoot, "callback-src/providers/claudeSdk.ts"),
    "utf8",
  );
  const cli = /CLAUDE_CODE_VERSION = "([^"]+)"/.exec(cliModule)?.[1];
  const sdk = /const SDK_VERSION = "([^"]+)"/.exec(sdkLoader)?.[1];
  if (cli === undefined || sdk === undefined) {
    throw new Error("could not read the current pins; the constants moved");
  }
  return { cliVersion: cli, sdkVersion: sdk };
}

const latest = latestPair();
const current = currentPins();

if (
  current.sdkVersion === latest.sdkVersion &&
  current.cliVersion === latest.cliVersion
) {
  console.log(`Already on SDK ${latest.sdkVersion} / CLI ${latest.cliVersion}`);
  process.exit(0);
}

console.log(
  `Bumping SDK ${current.sdkVersion} → ${latest.sdkVersion}, CLI ${current.cliVersion} → ${latest.cliVersion}`,
);

replaceOnce(
  "packages/backend/convex/_sandbox_runtime/claudeCliVersion.ts",
  `CLAUDE_CODE_VERSION = "${current.cliVersion}"`,
  `CLAUDE_CODE_VERSION = "${latest.cliVersion}"`,
);
replaceOnce(
  "packages/backend/callback-src/providers/claudeSdk.ts",
  `const SDK_VERSION = "${current.sdkVersion}"`,
  `const SDK_VERSION = "${latest.sdkVersion}"`,
);
replaceOnce(
  "packages/backend/convex/snapshotActions.ts",
  `const CLAUDE_AGENT_SDK_VERSION = "${current.sdkVersion}"`,
  `const CLAUDE_AGENT_SDK_VERSION = "${latest.sdkVersion}"`,
);
replaceOnce(
  "packages/backend/tests/providerSdkDependenciesContract.test.ts",
  `const CLAUDE_AGENT_SDK_PIN = "${current.sdkVersion}"`,
  `const CLAUDE_AGENT_SDK_PIN = "${latest.sdkVersion}"`,
);
replaceOnce(
  "packages/backend/package.json",
  `"${SDK_PACKAGE}": "${current.sdkVersion}"`,
  `"${SDK_PACKAGE}": "${latest.sdkVersion}"`,
);

console.log("Installing…");
run("pnpm", ["install"], { inherit: true });

console.log("Rebuilding the callback bundle…");
run("pnpm", ["--filter", "@eva/backend", "build:callback"], { inherit: true });

console.log("Running the pin contract tests…");
run("bun", ["test", "tests/providerSdkDependenciesContract.test.ts"], {
  cwd: backendRoot,
  inherit: true,
});

console.log(
  `Bumped to SDK ${latest.sdkVersion} / CLI ${latest.cliVersion}. Review the diff, then ship.`,
);
