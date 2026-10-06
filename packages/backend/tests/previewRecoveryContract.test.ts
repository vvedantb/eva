import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What is left here is text that only exists as text: a prompt sent to an
 * agent, and a script generated as a string and run inside the sandbox.
 *
 * The recovery behaviour these used to pin by reading source is now run:
 * previewPoll.test.ts for the readiness poll's ordering, and
 * previewRecoveryOwners.test.ts for the owner guards and per-owner mapping.
 */

describe("agents are told the dev server is managed", () => {
  test("the edit prompt names the port, the auto-start and the ban", () => {
    // "No Next server is running" seconds after a sandbox start → the agent
    // launches its own → duplicate dev servers → OOM.
    const prompts = readSource("convex/_sessions/prompts.ts");
    expect(prompts).toContain("App dev server (managed by Eva)");
    expect(prompts).toContain("NEVER start your own dev server");
    expect(prompts).toContain("A cold compile takes 1-2 minutes");
  });
});

/**
 * The proxy runs detached with no supervisor, so one uncaught throw killed it
 * and took the preview down until someone asked for a restart.
 */
describe("the preview proxy survives uncaught errors", () => {
  test("the generated script installs process-level handlers", () => {
    const previewProxy = readSource("convex/_sandbox_runtime/previewProxy.ts");
    expect(previewProxy).toContain('process.on("uncaughtException"');
    expect(previewProxy).toContain('process.on("unhandledRejection"');
  });
});

/** Comments name the very strings these rules look for, so they have to go first. */
function readSource(relativePath: string): string {
  return readFileSync(join(backendDir, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
