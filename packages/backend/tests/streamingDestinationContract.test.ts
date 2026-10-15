import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

const executionSource = readSource(
  "../convex/_sandbox_runtime/execution.ts",
);
const taskChatSource = readSource("../convex/agentTaskChatWorkflow.ts");
const projectChatSource = readSource("../convex/projectChatWorkflow.ts");
const chatDaemonLaunchSource = readSource(
  "../convex/_chat/chatDaemonLaunch.ts",
);
const streamRouterSource = readSource("../callback-src/parse/streamRouter.ts");
const generatedCallbackSource = readSource(
  "../convex/_sandbox_runtime/callbackScript.generated.ts",
);

describe("warm daemons stream to the UI's entity key", () => {
  test("the shared prewarm action launches and signs for the explicit stream id", () => {
    expect(executionSource).toContain(
      "const streamingEntityId = args.streamingEntityId ?? entityIdStr;",
    );
    expect(executionSource).toContain(
      "STREAMING_ENTITY_ID: streamingEntityId",
    );
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
        expect(
          call.builder !== undefined || call.args.includes("streamingEntityId"),
          "a hand-built prewarm payload dropped its stream id",
        ).toBe(true);
      }
    },
  );

  test.each([
    {
      builder: "export function taskChatDaemonLaunchArgs(",
      streamId: "streamingEntityId: taskChatStreamEntityId(p.taskId)",
    },
    {
      builder: "export function projectChatDaemonLaunchArgs(",
      streamId: "streamingEntityId: projectChatStreamEntityId(p.projectId)",
    },
  ])("the shared $builder payload sets the prefixed stream id", (c) => {
    expect(functionBody(chatDaemonLaunchSource, c.builder)).toContain(
      c.streamId,
    );
  });
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
  expect(cursorParser).toContain(
    'events.push({ kind: "stream_text_delta", text: block.text });',
  );
  expect(cursorParser).not.toContain(
    'events.push({ kind: "append_text", text: block.text });',
  );
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

/** Each prewarm payload: a literal, or a `*ChatDaemonLaunchArgs({...})` call. */
function prewarmCalls(
  source: string,
): { builder: string | undefined; args: string }[] {
  return [
    ...source.matchAll(
      /internal\.sandbox\.prewarmEntityDaemon,\s*(\w+ChatDaemonLaunchArgs\()?\{([\s\S]*?)\n\s*\}\)[;,]/g,
    ),
  ].map((match) => ({ builder: match[1], args: match[2] ?? "" }));
}
