import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const oneShotSource = readSource("callback-src/index.ts");
const completionSource = readSource("callback-src/runtime/completion.ts");
const sessionPromptSource = readSource("convex/_sessions/prompts.ts");
const bundledScript = readSource(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);

/**
 * A one-shot agent can be killed directly by a signal or through a shell that
 * translates SIGTERM/SIGKILL to 143/137. Cursor's fallback result still uses
 * the last streamed assistant text, so an interrupted "recording now…"
 * preamble can otherwise look like a successful final answer.
 */
describe("a signal-killed one-shot turn is never reported as success", () => {
  // The CLI runner that translated a child's close signal into
  // `terminatedBySignal` is deleted; no provider spawns an agent subprocess
  // any more, so every SDK runner reports it false and the surviving guards
  // below (137/143 exit codes, agentWasInterrupted) carry the invariant.
  test("callback source uses the shared attempt-outcome helper", () => {
    expect(oneShotSource).toContain("resolveProviderAttemptOutcome(");
    expect(oneShotSource).toContain("providerAttemptWasInterrupted(");
    const completionAt = oneShotSource.indexOf("completionSuccess =");
    expect(completionAt, "completionSuccess moved").toBeGreaterThan(-1);
    const completionExpr = oneShotSource.slice(
      completionAt,
      oneShotSource.indexOf(";", completionAt),
    );
    const killAt = completionExpr.indexOf("agentWasInterrupted");
    const resultAt = completionExpr.indexOf("finalResultEvent");
    expect(
      killAt,
      "completionSuccess no longer checks agentWasInterrupted",
    ).toBeGreaterThan(-1);
    expect(
      resultAt,
      "completionSuccess no longer falls back to the result event",
    ).toBeGreaterThan(-1);
    expect(killAt).toBeLessThan(resultAt);
  });

  test("deployed bundle still has the inline interruption guards", () => {
    const source = bundledScript;
    const defineAt = source.indexOf("const agentWasInterrupted =");
    expect(
      defineAt,
      "agentWasInterrupted moved or was renamed",
    ).toBeGreaterThan(-1);
    const definition = source.slice(defineAt, source.indexOf(";", defineAt));
    expect(definition).toContain("finalTerminatedBySignal");
    expect(definition).toContain("finalCode === 137");
    expect(definition).toContain("finalCode === 143");

    const succeededAt = source.indexOf("runSucceededWithResult =");
    expect(succeededAt, "runSucceededWithResult moved").toBeGreaterThan(-1);
    const succeededLine = source.slice(
      succeededAt,
      source.indexOf(";", succeededAt),
    );
    expect(succeededLine).toContain("!agentWasInterrupted");

    const completionAt = source.indexOf("completionSuccess =");
    expect(completionAt, "completionSuccess moved").toBeGreaterThan(-1);
    const completionExpr = source.slice(
      completionAt,
      source.indexOf(";", completionAt),
    );
    const killAt = completionExpr.indexOf("agentWasInterrupted");
    const resultAt = completionExpr.indexOf("finalResultEvent");
    expect(
      killAt,
      "completionSuccess no longer checks agentWasInterrupted",
    ).toBeGreaterThan(-1);
    expect(
      resultAt,
      "completionSuccess no longer falls back to the result event",
    ).toBeGreaterThan(-1);
    expect(killAt).toBeLessThan(resultAt);
    expect(defineAt).toBeLessThan(succeededAt);
    expect(defineAt).toBeLessThan(completionAt);
  });

  test.each([
    ["callback source", completionSource],
    ["deployed bundle", bundledScript],
  ])(
    "a bare signal kill reports as an interruption, not a raw code (%s)",
    (_label, source) => {
      // The signal branch sits AFTER every timeout branch (a timeout that ends in
      // SIGTERM keeps its specific message) and BEFORE the raw "exited with code"
      // fallback, so only an unexplained signal death gets the interrupted copy.
      const timeoutAt = source.indexOf("timedOutForNoOutput");
      const signalAt = source.indexOf("code === 137 || code === 143");
      const rawExitAt = source.indexOf('" exited with code "');
      expect(timeoutAt, "the no-output timeout branch moved").toBeGreaterThan(
        -1,
      );
      expect(
        signalAt,
        "the signal-kill branch moved or was renamed",
      ).toBeGreaterThan(-1);
      expect(rawExitAt, "the raw exit-code fallback moved").toBeGreaterThan(-1);
      expect(timeoutAt).toBeLessThan(signalAt);
      expect(signalAt).toBeLessThan(rawExitAt);
    },
  );
});

describe("recording turns cannot self-interrupt or finish on a promise", () => {
  test("the session prompt bans broad process matching", () => {
    expect(sessionPromptSource).toContain("Never use \\`pkill -f\\`");
    expect(sessionPromptSource).toContain("capture its exact PID");
  });

  test("all-feature requests require a deliverable per checklist item", () => {
    expect(sessionPromptSource).toContain(
      'For "each" or "all features" requests',
    );
    expect(sessionPromptSource).toContain(
      "one isolated deliverable per checklist item",
    );
    expect(sessionPromptSource).toContain(
      'A status update such as "recording now" is not a final answer',
    );
  });
});

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
