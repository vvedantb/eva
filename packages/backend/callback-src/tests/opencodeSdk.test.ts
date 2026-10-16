import { expect, test } from "vitest";
import { opencodeParseLine } from "../providers/opencode.js";
import {
  createPartEmitState,
  ensureEvaMcpServers,
  opencodeErrorMessage,
  opencodeEventSessionId,
  opencodePartToCliLine,
  readTurnUsage,
  splitOpencodeModel,
} from "../providers/opencodeSdk.js";
import type {
  OpencodeAssistantMessage,
  OpencodeClientLike,
  OpencodeEvent,
  OpencodeMcpLocalConfig,
  OpencodeMcpRemoteConfig,
  OpencodePart,
} from "../providers/opencodeSdkTypes.js";
import type { JsonObject } from "../types.js";

const SESSION = "ses_abc";

function parseLine(line: string | null): JsonObject {
  if (line === null) throw new Error("expected a translated line");
  const parsed: JsonObject = JSON.parse(line);
  return parsed;
}

function textPart(id: string, text: string): OpencodePart {
  return { id, sessionID: SESSION, messageID: "msg_1", type: "text", text };
}

function toolPart(id: string, status: string): OpencodePart {
  return {
    id,
    sessionID: SESSION,
    messageID: "msg_1",
    type: "tool",
    callID: "call_" + id,
    tool: "bash",
    state: { status },
  };
}

test("splitOpencodeModel splits provider from model id", () => {
  expect(splitOpencodeModel("openai/gpt-5.4")).toEqual({
    providerID: "openai",
    modelID: "gpt-5.4",
  });
  // Model ids may contain further dashes but never a second slash in practice;
  // split on the first so the remainder stays intact.
  expect(splitOpencodeModel("openai/gpt-5.3-codex")).toEqual({
    providerID: "openai",
    modelID: "gpt-5.3-codex",
  });
});

test("splitOpencodeModel leaves unsplittable ids to the server default", () => {
  expect(splitOpencodeModel("gpt-5.4")).toEqual({
    providerID: "",
    modelID: "gpt-5.4",
  });
  expect(splitOpencodeModel("/gpt-5.4")).toEqual({
    providerID: "",
    modelID: "/gpt-5.4",
  });
  expect(splitOpencodeModel("openai/")).toEqual({
    providerID: "",
    modelID: "openai/",
  });
});

test("text parts forward only the delta of a cumulative update", () => {
  const state = createPartEmitState();
  expect(
    parseLine(opencodePartToCliLine(textPart("p1", "Hel"), state)),
  ).toEqual({
    type: "text",
    part: { ...textPart("p1", "Hel") },
    sessionID: SESSION,
  });
  const second = parseLine(
    opencodePartToCliLine(textPart("p1", "Hello world"), state),
  );
  expect(second.part).toMatchObject({ text: "lo world" });
  // A repeat with no new characters produces nothing.
  expect(
    opencodePartToCliLine(textPart("p1", "Hello world"), state),
  ).toBeNull();
});

test("interleaved text parts track their deltas independently", () => {
  const state = createPartEmitState();
  opencodePartToCliLine(textPart("p1", "one"), state);
  opencodePartToCliLine(textPart("p2", "two"), state);
  const first = parseLine(
    opencodePartToCliLine(textPart("p1", "one more"), state),
  );
  const second = parseLine(
    opencodePartToCliLine(textPart("p2", "two more"), state),
  );
  expect(first.part).toMatchObject({ text: " more" });
  expect(second.part).toMatchObject({ text: " more" });
});

test("reasoning parts translate to the reasoning line the parser expects", () => {
  const state = createPartEmitState();
  const part: OpencodePart = {
    id: "r1",
    sessionID: SESSION,
    messageID: "msg_1",
    type: "reasoning",
    text: "thinking hard",
  };
  const line = parseLine(opencodePartToCliLine(part, state));
  expect(line.type).toBe("reasoning");
  expect(opencodeParseLine(line)).toEqual([
    { kind: "update_reasoning", text: "thinking hard" },
  ]);
});

test("tool parts emit once per status transition", () => {
  const state = createPartEmitState();
  expect(
    opencodePartToCliLine(toolPart("t1", "pending"), state),
  ).not.toBeNull();
  // Same status re-sent on every mutation of the part — must not duplicate.
  expect(opencodePartToCliLine(toolPart("t1", "pending"), state)).toBeNull();
  const running = parseLine(
    opencodePartToCliLine(toolPart("t1", "running"), state),
  );
  expect(running.type).toBe("tool_use");
  expect(opencodePartToCliLine(toolPart("t1", "running"), state)).toBeNull();
  expect(
    opencodePartToCliLine(toolPart("t1", "completed"), state),
  ).not.toBeNull();
});

test("parallel tools keep separate status tracks", () => {
  const state = createPartEmitState();
  opencodePartToCliLine(toolPart("t1", "running"), state);
  expect(
    opencodePartToCliLine(toolPart("t2", "running"), state),
  ).not.toBeNull();
  expect(opencodePartToCliLine(toolPart("t1", "running"), state)).toBeNull();
});

test("translated tool lines drive the existing canonical parser", () => {
  const state = createPartEmitState();
  const running: OpencodePart = {
    id: "t9",
    sessionID: SESSION,
    messageID: "msg_1",
    type: "tool",
    callID: "call_t9",
    tool: "bash",
    state: { status: "running" },
  };
  const pushed = opencodeParseLine(
    parseLine(opencodePartToCliLine(running, state)),
  );
  expect(pushed).toHaveLength(1);
  expect(pushed[0]).toMatchObject({ kind: "push_step" });

  const completed: OpencodePart = {
    ...running,
    state: { status: "completed" },
  };
  const done = opencodeParseLine(
    parseLine(opencodePartToCliLine(completed, state)),
  );
  expect(done).toHaveLength(1);
  // The push and its completion share a tracking id, so the UI step resolves
  // rather than stranding an active row.
  expect(done[0]).toMatchObject({ kind: "complete_tool", trackingId: "t9" });
  expect(pushed[0]).toMatchObject({ trackingId: "t9" });
});

test("step parts map to the CLI's underscored event names", () => {
  const state = createPartEmitState();
  const start: OpencodePart = {
    id: "s1",
    sessionID: SESSION,
    messageID: "msg_1",
    type: "step-start",
  };
  expect(parseLine(opencodePartToCliLine(start, state)).type).toBe(
    "step_start",
  );

  const finish: OpencodePart = {
    id: "s2",
    sessionID: SESSION,
    messageID: "msg_1",
    type: "step-finish",
    reason: "stop",
    cost: 0.01,
    tokens: {
      input: 10,
      output: 5,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  };
  const line = parseLine(opencodePartToCliLine(finish, state));
  expect(line.type).toBe("step_finish");
  expect(opencodeParseLine(line)).toEqual([{ kind: "mark_last_complete" }]);
});

test("parts the runner does not forward produce no line", () => {
  const state = createPartEmitState();
  const part: OpencodePart = {
    id: "f1",
    sessionID: SESSION,
    messageID: "msg_1",
    type: "file",
  };
  expect(opencodePartToCliLine(part, state)).toBeNull();
});

test("opencodeEventSessionId reads each event shape's session id", () => {
  const partEvent: OpencodeEvent = {
    type: "message.part.updated",
    properties: { part: textPart("p1", "hi") },
  };
  const messageEvent: OpencodeEvent = {
    type: "message.updated",
    properties: {
      info: { id: "msg_1", sessionID: SESSION, role: "user" },
    },
  };
  const idleEvent: OpencodeEvent = {
    type: "session.idle",
    properties: { sessionID: SESSION },
  };
  const connected: OpencodeEvent = { type: "server.connected" };
  expect(opencodeEventSessionId(partEvent)).toBe(SESSION);
  expect(opencodeEventSessionId(messageEvent)).toBe(SESSION);
  expect(opencodeEventSessionId(idleEvent)).toBe(SESSION);
  expect(opencodeEventSessionId(connected)).toBe("");
});

test("readTurnUsage folds reasoning into output tokens", () => {
  const info: OpencodeAssistantMessage = {
    id: "msg_1",
    sessionID: SESSION,
    role: "assistant",
    modelID: "gpt-5.4",
    providerID: "openai",
    cost: 0.1234,
    tokens: {
      input: 1000,
      output: 200,
      reasoning: 50,
      cache: { read: 800, write: 120 },
    },
  };
  expect(readTurnUsage(info)).toEqual({
    costUsd: 0.1234,
    inputTokens: 1000,
    outputTokens: 250,
    cacheReadTokens: 800,
    cacheWriteTokens: 120,
    model: "gpt-5.4",
  });
});

test("opencodeErrorMessage prefers the server message, then the error name", () => {
  expect(
    opencodeErrorMessage({
      name: "ProviderAuthError",
      data: { message: "missing api key" },
    }),
  ).toBe("missing api key");
  expect(opencodeErrorMessage({ name: "MessageOutputLengthError" })).toBe(
    "MessageOutputLengthError",
  );
  expect(opencodeErrorMessage(undefined)).toBe("");
});

function mcpClientStub(known: Record<string, { status: string } | undefined>): {
  client: Pick<OpencodeClientLike, "mcp">;
  added: Array<{
    name: string;
    config: OpencodeMcpRemoteConfig | OpencodeMcpLocalConfig;
  }>;
} {
  const added: Array<{
    name: string;
    config: OpencodeMcpRemoteConfig | OpencodeMcpLocalConfig;
  }> = [];
  return {
    added,
    client: {
      mcp: {
        status: () => Promise.resolve({ data: known }),
        add: (options) => {
          added.push(options.body);
          return Promise.resolve({
            data: { [options.body.name]: { status: "connected" } },
          });
        },
      },
    },
  };
}

test("ensureEvaMcpServers registers the eva server on the live opencode server", async () => {
  const { client, added } = mcpClientStub({});

  await ensureEvaMcpServers(client, {
    eva: {
      type: "http",
      url: "https://example.convex.site/mcp",
      headers: { Authorization: "Bearer token-123" },
    },
  });

  expect(added).toEqual([
    {
      name: "eva",
      config: {
        type: "remote",
        url: "https://example.convex.site/mcp",
        headers: { Authorization: "Bearer token-123" },
        enabled: true,
      },
    },
  ]);
});

test("ensureEvaMcpServers registers a repo stdio server as a local command", async () => {
  const { client, added } = mcpClientStub({});

  await ensureEvaMcpServers(client, {
    "figma-dev": {
      type: "stdio",
      command: "npx",
      args: ["-y", "figma-developer-mcp"],
      env: { FIGMA_API_KEY: "f-1" },
    },
  });

  expect(added).toEqual([
    {
      name: "figma-dev",
      config: {
        type: "local",
        command: ["npx", "-y", "figma-developer-mcp"],
        environment: { FIGMA_API_KEY: "f-1" },
        enabled: true,
      },
    },
  ]);
});

test("ensureEvaMcpServers skips servers the opencode server already knows", async () => {
  const registered = mcpClientStub({ eva: { status: "connected" } });
  await ensureEvaMcpServers(registered.client, {
    eva: {
      type: "http",
      url: "https://example.convex.site/mcp",
      headers: { Authorization: "Bearer token-123" },
    },
  });
  expect(registered.added).toEqual([]);

  // No MCP token in the environment means no status probe and no registration.
  const unconfigured = mcpClientStub({});
  await ensureEvaMcpServers(unconfigured.client, {});
  expect(unconfigured.added).toEqual([]);
});
