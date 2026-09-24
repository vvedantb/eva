import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

const executionSource = readSource("../convex/_sandbox_runtime/execution.ts");
const taskChatSource = readSource("../convex/agentTaskChatWorkflow.ts");
const projectChatSource = readSource("../convex/projectChatWorkflow.ts");
const streamRouterSource = readSource("../callback-src/parse/streamRouter.ts");
const generatedCallbackSource = readSource(
  "../convex/_sandbox_runtime/callbackScript.generated.ts",
);

describe("warm daemons stream to the UI's entity key", () => {
  test("the shared prewarm action launches and signs for the explicit stream id", () => {
    expect(executionSource).toContain(
      "const streamingEntityId = args.streamingEntityId ?? entityIdStr;",
    );
    expect(executionSource).toContain("STREAMING_ENTITY_ID: streamingEntityId");
    expect(executionSource).toContain(
      "streamingEntityId: v.optional(v.string())",
    );
  });

  test("the stream id participates in daemon identity", () => {
    const signature = functionBody(
      executionSource,
      "function buildDaemonOptsSig(",
    );
    expect(signature).toContain("streamingEntityId: string");
    expect(signature).toContain("${streamingEntityId}");
  });

  test.each([
    { name: "task chat", source: taskChatSource, expectedCalls: 4 },
    { name: "project chat", source: projectChatSource, expectedCalls: 4 },
  ])(
    "every $name prewarm passes its prefixed stream id",
    ({ source, expectedCalls }) => {
      const calls = prewarmCalls(source);
      expect(calls.length).toBe(expectedCalls);
      for (const call of calls) {
        expect(call).toContain("streamingEntityId");
      }
    },
  );
});

test("complete provider events request an immediate activity drain", () => {
  const processChunk = functionBody(
    streamRouterSource,
    "export function processRealtimeStdoutChunk(",
  );
  const handleAt = processChunk.indexOf("handleRealtimeStreamLine(line)");
  const flushAt = processChunk.indexOf("void flushStreaming()");
  expect(handleAt).toBeGreaterThan(-1);
  expect(flushAt).toBeGreaterThan(handleAt);
  expect(generatedCallbackSource).toContain(
    "handleRealtimeStreamLine(line);\n    void flushStreaming();",
  );
});

test("the generated callback preserves Cursor text delta semantics", () => {
  const cursorParser = functionBody(
    generatedCallbackSource,
    "function cursorEventToCanonical(",
  );
  // Assistant text must flow through the streaming destination, whatever the
  // local holding the text is called (the Schema decode names it `text`).
  expect(cursorParser).toMatch(
    /events\.push\(\{ kind: "stream_text_delta", text(?:: [\w.]+)? \}\)/,
  );
  expect(cursorParser).not.toContain('kind: "append_text"');
});

function readSource(relativePath: string): string {
  return readFileSync(join(testsDir, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}

function prewarmCalls(source: string): string[] {
  return [
    ...source.matchAll(
      /internal\.sandbox\.prewarmEntityDaemon,\s*\{([\s\S]*?)\n\s*\}\);/g,
    ),
  ].map((match) => match[1] ?? "");
}
