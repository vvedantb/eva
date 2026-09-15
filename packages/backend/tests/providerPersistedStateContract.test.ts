import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  CURSOR_PERSIST_DIR,
  CURSOR_SDK_STORE_DIR,
} from "../callback-src/config.js";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const read = (relativePath: string): string =>
  readFileSync(join(backendDir, relativePath), "utf8").replaceAll("\r\n", "\n");

const config = read("callback-src/config.ts");
const launch = read("convex/_sandbox_runtime/launch.ts");
const callbackBundle = read(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);

/** The literal in `process.env.<name> || "…"`, i.e. the callback's fallback. */
function envDefault(name: string): string {
  const found = new RegExp(`process\\.env\\.${name} \\|\\|\\s*"([^"]+)"`).exec(
    config,
  );
  expect(found?.[1], `${name} no longer has a literal default`).toBeTruthy();
  return found?.[1] ?? "";
}

/** The literal an `export const <name> = "…"` declaration binds. */
function launchConstant(name: string): string {
  const found = new RegExp(`export const ${name} = "([^"]+)"`).exec(launch);
  expect(found?.[1], `${name} moved or was renamed`).toBeTruthy();
  return found?.[1] ?? "";
}

const providers: ReadonlyArray<{
  label: string;
  envVar: string;
  mountConstant: string;
}> = [
  {
    label: "claude",
    envVar: "CLAUDE_PERSIST_DIR",
    mountConstant: "CLAUDE_PERSIST_VOLUME_MOUNT_PATH",
  },
  {
    label: "codex",
    envVar: "CODEX_PERSIST_DIR",
    mountConstant: "CODEX_PERSIST_VOLUME_MOUNT_PATH",
  },
  {
    label: "opencode",
    envVar: "OPENCODE_PERSIST_DIR",
    mountConstant: "OPENCODE_PERSIST_VOLUME_MOUNT_PATH",
  },
  {
    label: "cursor",
    envVar: "CURSOR_PERSIST_DIR",
    mountConstant: "CURSOR_PERSIST_VOLUME_MOUNT_PATH",
  },
];

/**
 * Conversation state has to outlive the sandbox process. Every provider keeps
 * two roots: a `/tmp` RUNTIME dir the CLI/SDK actually works in, and a PERSIST
 * dir that survives stop/resume. `launch.ts` names the persist path and the
 * callback's `config.ts` repeats it as its own fallback, so the two literals
 * drifting apart is a silent split-brain — the callback writes to a directory
 * nothing restores from.
 */
describe("provider persisted state is wired to the persist volume", () => {
  for (const { label, envVar, mountConstant } of providers) {
    test(`${label}'s persist dir defaults to the path launch mounts it on`, () => {
      expect(envDefault(envVar)).toBe(launchConstant(mountConstant));
    });

    test(`launch exports ${label}'s persist dir from that mount path`, () => {
      expect(launch).toContain(`${envVar}=\${quote([${mountConstant}])}`);
    });

    test(`${label}'s persist dir is not a /tmp runtime path`, () => {
      // /tmp is wiped on resume; a persist dir pointed there loses every saved
      // conversation the moment a sandbox stops.
      expect(envDefault(envVar).startsWith("/tmp/")).toBe(false);
    });
  }
});

/**
 * The Cursor SDK's agent store IS the session's memory: an agent id whose store
 * is missing resumes as `agent_not_found`, and `canReplaceCursorAgent` then
 * silently starts a blank agent — no error, just amnesia. It moved from the
 * SDK's JSONL store to its SQLite store on 3 Sep 2026 (prod sessions 174/176,
 * where a resume went quadratic in conversation length and stalled every turn),
 * and the SQLite layout writes `index.db` plus `agents/agent-<sha>/store.db`
 * under a state root — so the state root has to be on the persist volume.
 */
describe("the Cursor SDK agent store lives on the persist volume", () => {
  test("the store dir hangs off the Cursor persist dir", () => {
    expect(CURSOR_SDK_STORE_DIR.startsWith(`${CURSOR_PERSIST_DIR}/`)).toBe(
      true,
    );
    expect(config).toContain(
      "export const CURSOR_SDK_STORE_DIR = CURSOR_PERSIST_DIR +",
    );
    // Never the runtime home: that is the /tmp scratch dir the SDK works in.
    expect(config).not.toContain(
      "CURSOR_SDK_STORE_DIR = CURSOR_RUNTIME_HOME_DIR",
    );
  });

  test("the deployed bundle carries the same store root", () => {
    // The sandbox runs the generated bundle, not the source.
    expect(callbackBundle).toContain(
      `var CURSOR_SDK_STORE_DIR = CURSOR_PERSIST_DIR + "/sdk"`,
    );
    expect(callbackBundle).toContain(
      `var CURSOR_PERSIST_DIR = process.env.CURSOR_PERSIST_DIR || "${envDefault("CURSOR_PERSIST_DIR")}"`,
    );
  });

  test("each attempt disposes the store it opened", () => {
    // The store holds SQLite handles for the whole attempt and the daemon runs
    // many attempts, so an undisposed store leaks a file handle per turn.
    const cursorLoader = read("callback-src/providers/cursorSdk.ts");
    expect(cursorLoader).toContain("await store.dispose();");
    expect(callbackBundle).toContain(".dispose();");
  });
});
