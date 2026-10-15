import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";
import { applyCanonicalEvents, parseToCanonical } from "../parse/canonical.js";
import {
  extractClaudeEdits,
  extractFilePaths,
  probeOpencodeStateResult,
  probeToolCompleteResult,
} from "../parse/toolResultCapture.js";
import { toolCallToStep } from "../parse/toolSteps.js";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";
import type { JsonObject } from "../types.js";
import { tryParseJson } from "../utils.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixtureLines(name: string): JsonObject[] {
  const raw = readFileSync(join(fixturesDir, name), "utf8");
  const lines: JsonObject[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = tryParseJson(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      lines.push(parsed);
    }
  }
  return lines;
}

function applyFixture(name: string, provider: string): void {
  resetStateForTests();
  for (const event of loadFixtureLines(name)) {
    applyCanonicalEvents(parseToCanonical(event, provider));
  }
}

test("claude captures bash output, edit diffs, and write preview", () => {
  applyFixture("claude-bash-edit.jsonl", "claude");
  const bash = S.accumulatedSteps.find((s) => s.toolUseId === "toolu_bash1");
  expect(bash?.type).toBe("bash");
  expect(bash?.command).toContain("git status");
  expect(bash?.output?.text).toContain("On branch main");
  expect(bash?.status).toBe("complete");

  const edit = S.accumulatedSteps.find((s) => s.toolUseId === "toolu_edit1");
  expect(edit?.type).toBe("edit");
  expect(edit?.edits?.[0]?.oldText).toBe("const x = 1");
  expect(edit?.edits?.[0]?.newText).toBe("const x = 2");

  const write = S.accumulatedSteps.find((s) => s.toolUseId === "toolu_write1");
  expect(write?.type).toBe("write");
  expect(write?.contentPreview).toContain("export const a");
  expect(write?.output?.text).toContain("Wrote file");
});

test("codex sets toolUseId, file_change files, and failed isError", () => {
  applyFixture("codex-shell-filechange.jsonl", "codex");
  const shell = S.accumulatedSteps.find((s) => s.toolUseId === "item_shell1");
  expect(shell?.type).toBe("bash");
  expect(shell?.toolUseId).toBe("item_shell1");
  expect(shell?.output?.text).toContain("PASS");
  expect(shell?.output?.exitCode).toBe(0);

  const files = S.accumulatedSteps.find((s) => s.toolUseId === "item_fc1");
  expect(files?.type).toBe("edit");
  expect(files?.files).toEqual(["/tmp/repo/src/a.ts", "/tmp/repo/src/b.ts"]);

  const failed = S.accumulatedSteps.find((s) => s.toolUseId === "item_fail1");
  expect(failed?.isError).toBe(true);
  expect(failed?.output?.exitCode).toBe(1);
});

test("cursor pairs call_id, unwraps result envelopes, and dedups transitions", () => {
  applyFixture("cursor-sdk-events.jsonl", "cursor");
  // 3 tools despite duplicate running/completed events and a
  // terminal-without-running error (pushed then completed). The stream also
  // carries a thinking event, which now lands as its own reasoning step.
  const toolSteps = S.accumulatedSteps.filter((s) => s.type !== "reasoning");
  expect(toolSteps).toHaveLength(3);
  expect(S.accumulatedSteps.filter((s) => s.type === "reasoning")).toHaveLength(
    1,
  );
  expect(S.inFlightToolUses).toBe(0);

  const shell = S.accumulatedSteps.find((s) => s.toolUseId === "call_cursor1");
  expect(shell?.type).toBe("bash");
  expect(shell?.command).toContain("ls -la");
  expect(shell?.output?.text).toContain("total 12");
  expect(shell?.output?.exitCode).toBe(0);
  expect(shell?.durationMs).toBe(42);
  expect(shell?.status).toBe("complete");

  const edit = S.accumulatedSteps.find((s) => s.toolUseId === "call_edit1");
  expect(edit?.type).toBe("edit");
  expect(edit?.path).toBe("src/a.ts");
  expect(edit?.output?.text).toContain("+const x = 2");
  expect(edit?.status).toBe("complete");

  const failed = S.accumulatedSteps.find((s) => s.toolUseId === "call_fail1");
  expect(failed?.type).toBe("bash");
  expect(failed?.isError).toBe(true);
  expect(failed?.output?.text).toContain("exited with status 1");
  expect(failed?.status).toBe("complete");
});

test("opencode captures output, exit, error, and durationMs", () => {
  applyFixture("opencode-tool.jsonl", "opencode");
  const ok = S.accumulatedSteps.find((s) => s.toolUseId === "part_oc1");
  expect(ok?.type).toBe("bash");
  expect(ok?.output?.text).toContain("/tmp/repo");
  expect(ok?.output?.exitCode).toBe(0);
  expect(ok?.durationMs).toBe(100);

  const err = S.accumulatedSteps.find((s) => s.toolUseId === "part_oc2");
  expect(err?.isError).toBe(true);
  expect(err?.output?.text).toContain("exit status 1");
});

test("a wrong-typed field never costs a sibling field", () => {
  // Provider streams are unstable, so every field is read on its own: a bad
  // `old_string` still leaves the `oldText` alias usable, and a bad `exit`
  // still lets the next alias supply the code.
  expect(extractClaudeEdits({ old_string: 1, new_string: "b" })).toBe(
    undefined,
  );
  expect(
    extractClaudeEdits({ edits: [{ old_string: 1, oldText: "a" }] }),
  ).toEqual([{ oldText: "a", newText: "" }]);
  expect(extractFilePaths({ files: ["a.ts", 2, "b.ts"] })).toEqual([
    "a.ts",
    "b.ts",
  ]);
  expect(
    probeOpencodeStateResult({
      output: "done",
      metadata: { exit: "nope", exit_code: 2 },
    })?.output?.exitCode,
  ).toBe(2);
  expect(
    probeToolCompleteResult({ stdout: "out", result: { exit_code: 3 } })?.output
      ?.exitCode,
  ).toBe(3);
});

test("malformed payloads fall back instead of throwing", () => {
  expect(probeToolCompleteResult(7)).toBe(undefined);
  expect(probeToolCompleteResult([1, 2])).toBe(undefined);
  expect(probeOpencodeStateResult({ time: { start: 5, end: 1 } })).toBe(
    undefined,
  );
  // Empty strings stay empty details rather than dropping out of the payload.
  expect(toolCallToStep("Glob", { pattern: "" }).detail).toBe("");
  expect(toolCallToStep("Glob", { pattern: 3 }).detail).toBe(undefined);
});
