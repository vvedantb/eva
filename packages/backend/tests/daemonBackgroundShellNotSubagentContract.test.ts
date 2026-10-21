import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces: [string, string][] = [
  ["callback source", read("callback-src/providers/claudeSdkDaemon.ts")],
  [
    "deployed bundle",
    read("convex/_sandbox_runtime/callbackScript.generated.ts"),
  ],
];

/**
 * The bug: the Claude SDK reports background Bash commands as tasks, and the
 * daemon stored them as background agents. A dev server run in the background
 * never ends, so it held the chat queue for the full 2-hour cap. The skip must
 * come before the entry joins the registry, in the source and in the bundle
 * that ships to sandboxes.
 */
test.each(surfaces)(
  "a background shell task is not registered as a subagent (%s)",
  (_label, source) => {
    const start = source.indexOf("function handleSystemTaskMessage(");
    const end = source.indexOf("function failSyntheticTurn(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handler = source.slice(start, end);

    const startedAt = handler.indexOf('subtype === "task_started"');
    const shellSkipAt = handler.indexOf('=== "local_bash"', startedAt);
    const returnAt = handler.indexOf("return;", shellSkipAt);
    const registerAt = handler.indexOf("unsettledBackgroundAgents.set(");
    const syncAt = handler.indexOf("syncBackgroundAgentsToConvex(");

    expect(startedAt).toBeGreaterThan(-1);
    expect(shellSkipAt).toBeGreaterThan(startedAt);
    expect(returnAt).toBeGreaterThan(shellSkipAt);
    expect(registerAt).toBeGreaterThan(returnAt);
    expect(syncAt).toBeGreaterThan(returnAt);
  },
);

function read(relativePath: string): string {
  return readFileSync(join(backendDir, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
