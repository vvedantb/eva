// Moves the Claude Agent SDK / Claude Code CLI pins to the latest published
// pair, so a new model never waits on someone noticing by hand.
//
// The pins exist because the callback's parsers are compiled against one SDK
// message shape and models are gated on the CLI binary's own version — see
// convex/_sandbox_runtime/claudeCliVersion.ts. Floating to `@latest` in the
// snapshot seed only resolves once, when the image is baked, which is exactly
// how a snapshot ended up stuck on CLI 2.1.246 (changelog, 2026-09-02). So the
// pins stay exact and this script moves them instead.
//
// Every edit is an exact-match replacement that throws when the site is gone:
// a refactor that renames a constant must fail loudly here rather than quietly
// leave one of the five sites behind.

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

/**
 * Latest SDK release and the CLI build it ships.
 *
 * `claudeCodeVersion` is declared in the SDK's own manifest, so the pair comes
 * from the publisher rather than from our assumption that the patch components
 * line up — the contract test asserts that they do, but the manifest is the
 * source of truth if it ever stops being true.
 */
function latestPair() {
  // Two plain field reads rather than `--json` + JSON.parse: npm prints a bare
  // string per field, so there is no untyped blob to validate at the boundary.
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
  // A published SDK that points at an unpublished CLI would leave every sandbox
  // failing its launch-time install, so confirm the CLI exists before writing.
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

// All five pin sites. The contract test in
// packages/backend/tests/providerSdkDependenciesContract.test.ts is the backstop
// that proves none of them drifted.
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

// The lockfile and node_modules must hold the new SDK before the bundle is
// rebuilt: build-callback-script.mjs typechecks callback-src against the
// installed types first, which is what caught the three real defects when the
// pin last moved (0.3.201's broken sdk.d.ts silently degraded to `any`).
console.log("Installing…");
run("pnpm", ["install"], { inherit: true });

console.log("Rebuilding the callback bundle…");
run("pnpm", ["--filter", "@eva/backend", "build:callback"], { inherit: true });

// Vitest directly, not `pnpm test --`: the pnpm passthrough hands the path to
// the script rather than to vitest, which runs the whole 2200-test suite and
// reports unrelated pre-existing failures as if this bump caused them.
console.log("Running the pin contract tests…");
run("npx", ["vitest", "run", "tests/providerSdkDependenciesContract.test.ts"], {
  cwd: backendRoot,
  inherit: true,
});

console.log(
  `Bumped to SDK ${latest.sdkVersion} / CLI ${latest.cliVersion}. Review the diff, then ship.`,
);
