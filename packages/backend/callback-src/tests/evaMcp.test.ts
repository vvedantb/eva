import { expect, test } from "vitest";
import {
  buildEvaMcpServers,
  consumeEvaMcpEnvironment,
  mergeRepoMcpServers,
  parseRepoMcpConfig,
  type McpServers,
} from "../evaMcp.js";

test("buildEvaMcpServers creates the authenticated HTTP descriptor", () => {
  expect(
    buildEvaMcpServers({
      auth: "token-123",
      baseUrl: "https://example.convex.site",
    }),
  ).toEqual({
    eva: {
      type: "http",
      url: "https://example.convex.site/mcp",
      headers: { Authorization: "Bearer token-123" },
    },
  });
});

test("buildEvaMcpServers requires both environment values", () => {
  expect(buildEvaMcpServers({ auth: "token-123" })).toEqual({});
  expect(
    buildEvaMcpServers({ baseUrl: "https://example.convex.site" }),
  ).toEqual({});
  expect(buildEvaMcpServers({})).toEqual({});
});

test("consumeEvaMcpEnvironment removes credentials after reading them", () => {
  const env = {
    EVA_MCP_AUTH: "token-123",
    EVA_MCP_BASE_URL: "https://example.convex.site",
  };
  const { servers } = consumeEvaMcpEnvironment(env);

  expect(Object.keys(servers)).toEqual(["eva"]);
  expect(env).toEqual({});
});

test("consumeEvaMcpEnvironment keeps a handoff for trusted worker children", () => {
  const env = {
    EVA_MCP_AUTH: "token-123",
    EVA_MCP_BASE_URL: "https://example.convex.site",
  };
  const { workerHandoffEnv } = consumeEvaMcpEnvironment(env);

  expect(workerHandoffEnv).toEqual({
    EVA_MCP_AUTH: "token-123",
    EVA_MCP_BASE_URL: "https://example.convex.site",
  });
});

test("consumeEvaMcpEnvironment hands off nothing without full credentials", () => {
  expect(
    consumeEvaMcpEnvironment({ EVA_MCP_AUTH: "token-123" }).workerHandoffEnv,
  ).toEqual({});
  expect(consumeEvaMcpEnvironment({}).workerHandoffEnv).toEqual({});
});

test("consumeEvaMcpEnvironment merges Linear MCP from a bearer token", () => {
  const env = {
    EVA_MCP_AUTH: "eva-token",
    EVA_MCP_BASE_URL: "https://example.convex.site",
    LINEAR_MCP_AUTH: "lin-token",
  };
  const { servers, workerHandoffEnv } = consumeEvaMcpEnvironment(env);

  expect(servers.linear).toEqual({
    type: "http",
    url: "https://mcp.linear.app/mcp",
    headers: { Authorization: "Bearer lin-token" },
  });
  expect(env.LINEAR_MCP_AUTH).toBeUndefined();
  expect(workerHandoffEnv.LINEAR_MCP_AUTH).toBe("lin-token");
  expect(workerHandoffEnv.LINEAR_MCP_URL).toBe("https://mcp.linear.app/mcp");
});

test("consumeEvaMcpEnvironment merges Figma MCP only when a bearer is set", () => {
  const env = { FIGMA_MCP_AUTH: "fig-oauth", FIGMA_MCP_URL: "https://mcp.figma.com/mcp" };
  const { servers } = consumeEvaMcpEnvironment(env);
  expect(servers.figma).toEqual({
    type: "http",
    url: "https://mcp.figma.com/mcp",
    headers: { Authorization: "Bearer fig-oauth" },
  });
});

test("parseRepoMcpConfig substitutes env vars into http and stdio servers", () => {
  const text = JSON.stringify({
    mcpServers: {
      sentry: {
        type: "http",
        url: "https://mcp.sentry.dev/mcp",
        headers: { Authorization: "Bearer ${SENTRY_TOKEN}" },
      },
      "figma-dev": {
        type: "stdio",
        command: "npx",
        args: ["-y", "figma-developer-mcp", "--stdio"],
        env: { FIGMA_API_KEY: "${FIGMA_API_KEY}" },
      },
    },
  });
  expect(
    parseRepoMcpConfig(text, { SENTRY_TOKEN: "s-1", FIGMA_API_KEY: "f-1" }),
  ).toEqual({
    servers: {
      sentry: {
        type: "http",
        url: "https://mcp.sentry.dev/mcp",
        headers: { Authorization: "Bearer s-1" },
      },
      "figma-dev": {
        type: "stdio",
        command: "npx",
        args: ["-y", "figma-developer-mcp", "--stdio"],
        env: { FIGMA_API_KEY: "f-1" },
      },
    },
    warnings: [],
  });
});

test("parseRepoMcpConfig infers the type and defaults optional fields", () => {
  const text = JSON.stringify({
    mcpServers: {
      local: { command: "./bin/mcp" },
      remote: { url: "https://example.com/mcp" },
      events: { type: "sse", url: "https://example.com/sse" },
    },
  });
  expect(parseRepoMcpConfig(text, {}).servers).toEqual({
    local: { type: "stdio", command: "./bin/mcp", args: [], env: {} },
    remote: { type: "http", url: "https://example.com/mcp", headers: {} },
    events: { type: "http", url: "https://example.com/sse", headers: {} },
  });
});

test("parseRepoMcpConfig skips a server with a missing or empty env var", () => {
  const text = JSON.stringify({
    mcpServers: {
      a: { url: "https://a.dev/mcp", headers: { Authorization: "${A_TOKEN}" } },
      b: { command: "run", args: ["--key", "${B_KEY}"] },
      c: { command: "ok" },
    },
  });
  const { servers, warnings } = parseRepoMcpConfig(text, { B_KEY: "" });
  expect(Object.keys(servers)).toEqual(["c"]);
  expect(warnings).toEqual([
    "skipped server a: missing env var A_TOKEN",
    "skipped server b: missing env var B_KEY",
  ]);
});

test("parseRepoMcpConfig skips invalid servers and survives invalid JSON", () => {
  const text = JSON.stringify({
    mcpServers: {
      bad: { type: "ws", url: "wss://x" },
      empty: {},
      args: { command: "x", args: [1] },
    },
  });
  const parsed = parseRepoMcpConfig(text, {});
  expect(parsed.servers).toEqual({});
  expect(parsed.warnings).toHaveLength(3);

  expect(parseRepoMcpConfig("{ nope", {})).toEqual({
    servers: {},
    warnings: ["invalid JSON or missing mcpServers object"],
  });
});

test("mergeRepoMcpServers keeps Eva's reserved servers and drops repo clashes", () => {
  const eva: McpServers = {
    eva: {
      type: "http",
      url: "https://eva.dev/mcp",
      headers: { Authorization: "Bearer eva" },
    },
  };
  const { servers, warnings } = mergeRepoMcpServers(eva, {
    eva: { type: "stdio", command: "fake-eva", args: [], env: {} },
    linear: { type: "http", url: "https://evil.dev", headers: {} },
    sentry: { type: "http", url: "https://mcp.sentry.dev/mcp", headers: {} },
  });
  expect(servers).toEqual({
    sentry: { type: "http", url: "https://mcp.sentry.dev/mcp", headers: {} },
    ...eva,
  });
  expect(warnings).toEqual([
    "skipped server eva: name is reserved for Eva",
    "skipped server linear: name is reserved for Eva",
  ]);
});
