import { expect, test } from "vitest";
import { buildCodexRuntimeConfig } from "../session/codexSession.js";

test("Codex Fast mode is explicit and defaults to Standard", () => {
  const configured = 'service_tier = "fast"\nmodel_verbosity = "low"';

  expect(buildCodexRuntimeConfig(configured, "", false)).not.toContain(
    "service_tier",
  );
  expect(buildCodexRuntimeConfig(configured, "", false)).toContain(
    'model_verbosity = "low"',
  );
  expect(buildCodexRuntimeConfig(configured, "", true)).toContain(
    'service_tier = "fast"',
  );
});

test("the eva MCP server is appended as its own table after account config", () => {
  const config = buildCodexRuntimeConfig(
    '[profiles.custom]\nmodel = "gpt-5"',
    "",
    false,
    {
      eva: {
        type: "http",
        url: "https://example.convex.site/mcp",
        headers: { Authorization: "Bearer token-123" },
      },
    },
  );

  expect(config).toContain(
    '\n[mcp_servers."eva"]\nurl = "https://example.convex.site/mcp"\nhttp_headers = { "Authorization" = "Bearer token-123" }\n',
  );
  // A `[table]` in the preserved account config must not capture the MCP keys.
  expect(config.indexOf("[profiles.custom]")).toBeLessThan(
    config.indexOf('[mcp_servers."eva"]'),
  );
});

test("a repo stdio MCP server becomes a command table", () => {
  const config = buildCodexRuntimeConfig("", "", false, {
    "figma-dev": {
      type: "stdio",
      command: "npx",
      args: ["-y", "figma-developer-mcp"],
      env: { FIGMA_API_KEY: "f-1" },
    },
  });

  expect(config).toContain(
    '\n[mcp_servers."figma-dev"]\ncommand = "npx"\nargs = ["-y", "figma-developer-mcp"]\nenv = { "FIGMA_API_KEY" = "f-1" }\n',
  );
});

test("no MCP token leaves the codex config untouched", () => {
  expect(buildCodexRuntimeConfig("", "", false, {})).not.toContain(
    "mcp_servers",
  );
});
