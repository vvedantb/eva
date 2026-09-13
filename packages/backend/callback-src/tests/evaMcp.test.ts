import { expect, test } from "vitest";
import {
  buildEvaMcpServers,
  consumeEvaMcpEnvironment,
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
  expect(servers.figma?.headers).toEqual({
    Authorization: "Bearer fig-oauth",
  });
});
