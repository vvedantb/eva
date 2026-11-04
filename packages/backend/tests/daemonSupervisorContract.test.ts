import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string =>
  readFileSync(join(backendDir, path), "utf8");

const daemons = [
  read("callback-src/providers/claudeSdkDaemon.ts"),
  read("callback-src/providers/codexAppServerDaemon.ts"),
  read("callback-src/providers/cursorSdkDaemon.ts"),
];

test("Claude, Codex and Cursor share one local lifecycle supervisor", () => {
  for (const daemon of daemons) {
    expect(daemon).toContain("new DaemonSupervisor<");
    expect(daemon).toContain("supervisor.parkClaim(");
    expect(daemon).toContain("supervisor.beginCancellation()");
    expect(daemon).toContain("supervisor.beginFinalizing()");
    expect(daemon).toContain("supervisor.settleTurn()");
  }
});

test("legacy independent lifecycle booleans are gone", () => {
  const joined = daemons.join("\n");
  for (const declaration of [
    "let daemonExiting",
    "let callbackRefreshPending",
    "let openingSyntheticTurn",
    "let turnCancelInFlight",
    "let cancelInFlight",
    "let pendingClaimedTurn",
    "let pendingTurn:",
  ]) {
    expect(joined).not.toContain(declaration);
  }
});

test("the checked-in sandbox bundle includes the supervisor", () => {
  const bundle = read("convex/_sandbox_runtime/callbackScript.generated.ts");
  expect(bundle).toContain("var DaemonSupervisor = class");
  expect(bundle).toContain(".beginFinalizing()");
});
