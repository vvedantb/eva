import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV } from "../callback-src/providers/cursorSdk.js";

const testsDir = dirname(fileURLToPath(import.meta.url));

const backendPackage = readFileSync(join(testsDir, "../package.json"), "utf8");
const claudeLoader = readFileSync(
  join(testsDir, "../callback-src/providers/claudeSdk.ts"),
  "utf8",
);
const cursorLoader = readFileSync(
  join(testsDir, "../callback-src/providers/cursorSdk.ts"),
  "utf8",
);
const snapshotActions = readFileSync(
  join(testsDir, "../convex/snapshotActions.ts"),
  "utf8",
);
const claudeCliVersionModule = readFileSync(
  join(testsDir, "../convex/_sandbox_runtime/claudeCliVersion.ts"),
  "utf8",
);
const launchRuntime = readFileSync(
  join(testsDir, "../convex/_sandbox_runtime/launch.ts"),
  "utf8",
);

// The published bundle Eva actually imports (`dist/esm` next to the resolved
// CommonJS entry), read so a contract can be asserted against the pinned code.
const cursorSdkBundle = readFileSync(
  join(
    dirname(createRequire(import.meta.url).resolve("@cursor/sdk")),
    "../esm/index.js",
  ),
  "utf8",
);
const cursorSdkSqliteBundle = readFileSync(
  join(
    dirname(createRequire(import.meta.url).resolve("@cursor/sdk")),
    "../esm/sqlite.js",
  ),
  "utf8",
);
const callbackBundle = readFileSync(
  join(testsDir, "../convex/_sandbox_runtime/callbackScript.generated.ts"),
  "utf8",
);

const CLAUDE_AGENT_SDK_PIN = "0.3.258";

const sdkVersions = [
  {
    packageName: "@anthropic-ai/claude-agent-sdk",
    version: CLAUDE_AGENT_SDK_PIN,
    versionConstant: "CLAUDE_AGENT_SDK_VERSION",
    loader: claudeLoader,
  },
  {
    packageName: "@cursor/sdk",
    version: "1.0.28",
    versionConstant: "CURSOR_SDK_VERSION",
    loader: cursorLoader,
  },
];

test("provider SDK dependencies match the callback loader versions", () => {
  for (const sdk of sdkVersions) {
    expect(backendPackage).toContain(
      `"${sdk.packageName}": "${sdk.version}"`,
    );
    expect(sdk.loader).toContain(`const SDK_PACKAGE = "${sdk.packageName}"`);
    expect(sdk.loader).toContain(`const SDK_VERSION = "${sdk.version}"`);
  }
});

test("provider boundaries use official SDK declarations", () => {
  expect(claudeLoader).toMatch(
    /import type \{[^}]*\} from "@anthropic-ai\/claude-agent-sdk"/,
  );
  expect(claudeLoader).toContain("SdkModule = { query: typeof query }");
  expect(cursorLoader).toMatch(/import type \{[^}]*\} from "@cursor\/sdk"/);
  expect(cursorLoader).toContain("Cursor: typeof Cursor");
});

test("new snapshots preinstall both provider SDKs at the loader versions", () => {
  for (const sdk of sdkVersions) {
    // Version-pinned, never existence-only. A snapshot seeded before a pin
    // moved would otherwise keep serving an SDK whose message shapes the
    // callback's parsers do not recognise, which reads as a turn that streams
    // no activity at all rather than as an error.
    expect(snapshotActions).toContain(
      `const ${sdk.versionConstant} = "${sdk.version}"`,
    );
    expect(snapshotActions).toContain(
      `globalPackageIsVersion("${sdk.packageName}", ${sdk.versionConstant})`,
    );
    expect(snapshotActions).toContain(
      `${sdk.packageName}@\${${sdk.versionConstant}}`,
    );
  }
});

test("sandboxes pin the Claude Code CLI to the agent SDK's own build", () => {
  // The SDK spawns the globally installed `claude` binary and new models are
  // gated on that binary's version, so an unpinned CLI leaves an old snapshot
  // failing every turn with "does not support this model". Agent SDK 0.3.X
  // ships CLI 2.1.X, hence the shared patch component.
  const pinned = /CLAUDE_CODE_VERSION = "([^"]+)"/.exec(claudeCliVersionModule);
  const cliVersion = pinned?.[1];
  expect(cliVersion).toMatch(/^2\.1\.\d+$/);
  expect(cliVersion?.split(".").at(2)).toBe(
    CLAUDE_AGENT_SDK_PIN.split(".").at(2),
  );

  // One source of truth: the seed and the launch-time fallback both import it.
  expect(snapshotActions).toContain(
    'import { CLAUDE_CODE_VERSION } from "./_sandbox_runtime/claudeCliVersion"',
  );
  expect(launchRuntime).toContain(
    'import { CLAUDE_CODE_VERSION } from "./claudeCliVersion"',
  );

  // Version-pinned install plus a version-pinned "already installed" guard, so
  // a snapshot seeded with an older CLI reseeds instead of serving it forever.
  expect(snapshotActions).toContain(
    'globalPackageIsVersion("@anthropic-ai/claude-code", CLAUDE_CODE_VERSION)',
  );
  expect(snapshotActions).toContain(
    "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}",
  );
  expect(launchRuntime).toContain(
    "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}",
  );
  // No unpinned install survives anywhere.
  expect(snapshotActions).not.toMatch(/@anthropic-ai\/claude-code(?![@"])/);
  expect(launchRuntime).not.toMatch(/@anthropic-ai\/claude-code(?![@"])/);

  // Launch-time provisioning is version-aware, not existence-only: a live
  // sandbox whose global CLI predates the pin gets the pinned build under the
  // fallback prefix, and the callback prefers that over the drifted global
  // (session 62, 2026-09-02: a 14 Aug snapshot's 2.1.232 failed every Fable
  // 5.1 turn while the guard only fired when `claude` was missing).
  expect(launchRuntime).toContain("cli_version()");
  expect(launchRuntime).toContain(
    'CLAUDE_CLI_PINNED_VERSION=${quote([CLAUDE_CODE_VERSION])}',
  );
  expect(claudeLoader).toContain("process.env.CLAUDE_CLI_PINNED_VERSION");
  expect(claudeLoader).toContain(
    "if (pinned === null || globalVersion === pinned) return globalBin;",
  );
  expect(claudeLoader).toContain(
    "if (pinned === null || fallbackVersion === pinned) return fallback;",
  );
});

test("both loaders resolve their pin through one version-aware helper", () => {
  // The helper lives in the Claude loader; the others import it.
  expect(claudeLoader).toContain("export function resolvePinnedSdkEntry(");
  expect(claudeLoader).toContain("if (globalVersion === pin.version)");
  for (const sdk of sdkVersions) {
    expect(sdk.loader).toContain("resolvePinnedSdkEntry({");
    expect(sdk.loader).toContain("version: SDK_VERSION,");
  }
});

test("the Cursor SDK still reads the model catalog Eva hands it", () => {
  // Undocumented env var: the SDK reads it in Agent.create/Agent.resume in
  // place of its own listModels() network call, which is the round trip that
  // timed out on CURSOR_AGENT_SETUP_TIMEOUT_MS in prod. An SDK bump that
  // renames or drops it silently restores that remote dependency, so pin the
  // literal against the bundle — and against the constant, so a rename on our
  // side is caught too.
  expect(CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV).toBe(
    "CURSOR_SDK_LOCAL_MODEL_CATALOG_JSON",
  );
  expect(cursorSdkBundle).toContain(CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV);
  expect(cursorLoader).toContain(
    "process.env[CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV] = catalog",
  );
});

// The JSONL store rewrites its whole file on every append and re-parses it on
// every get, and a resumed `send()` issues one `checkpoints.get` per stored
// conversation blob — so resume cost grew quadratically and stalled prod turns
// on the 60s send budget (3 Sep 2026, sessions 174 and 176). Pin the SQLite
// store here so nothing quietly reintroduces the JSONL one.
test("the Cursor callback persists agents in the SDK's SQLite store, never the JSONL store", () => {
  // The pinned SDK still exports the class from its separate sqlite entry.
  expect(cursorSdkSqliteBundle).toContain("as SqliteLocalAgentStore}");

  expect(cursorLoader).toContain(
    'const SDK_SQLITE_ENTRY_RELPATH = "/dist/esm/sqlite.js"',
  );
  expect(cursorLoader).toContain("SqliteLocalAgentStore.open({");
  expect(cursorLoader).toContain("stateRoot: CURSOR_SDK_STORE_DIR");
  expect(cursorLoader).not.toContain("JsonlLocalAgentStore");

  // The sandbox runs the generated bundle, not the source: a stale bundle would
  // keep shipping the JSONL store no matter what the loader says.
  expect(callbackBundle).not.toContain("JsonlLocalAgentStore");
  expect(callbackBundle).toContain("SqliteLocalAgentStore");
});

test("older snapshots retain the user-local SDK fallback", () => {
  expect(claudeLoader).toContain(
    'const SDK_LOCAL_PREFIX = "/home/eva/.eva-agent-sdk"',
  );
  expect(claudeLoader).toContain("npm install --prefix");
});
