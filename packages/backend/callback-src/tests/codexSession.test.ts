import { afterEach, expect, test, vi } from "vitest";
import type * as callbackConfig from "../config.js";

// The session reasoning-effort lever, set per test.
const lever = vi.hoisted((): { effort: string } => ({ effort: "" }));

vi.mock("../config.js", async (importOriginal) => {
  const original = await importOriginal<typeof callbackConfig>();
  return {
    ...original,
    get codexReasoningEffort() {
      return lever.effort;
    },
  };
});

const { buildCodexRuntimeConfig } = await import("../session/codexSession.js");

afterEach(() => {
  lever.effort = "";
});

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

test("a repo SSE MCP server is written as a url table", () => {
  const config = buildCodexRuntimeConfig("", "", false, {
    events: { type: "sse", url: "https://example.com/sse", headers: {} },
  });

  expect(config).toContain(
    '\n[mcp_servers."events"]\nurl = "https://example.com/sse"\nhttp_headers = {  }\n',
  );
});

test("no account config and no MCP servers gives only Eva's runtime lines", () => {
  expect(buildCodexRuntimeConfig("", "", false, {})).toBe(
    'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n',
  );
});

/**
 * Eva runs codex unattended in a disposable sandbox: an account config that
 * asks for approvals or a sandbox would stall every tool call.
 */
test("account approval and sandbox settings are replaced by Eva's", () => {
  const account = [
    'sandbox_mode = "read-only"',
    'approval_policy = "on-request"',
    'model_reasoning_effort = "low"',
    'model = "gpt-5"',
  ].join("\n");

  expect(buildCodexRuntimeConfig(account, "", false, {})).toBe(
    [
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "low"',
      'model = "gpt-5"',
      "",
    ].join("\n"),
  );

  lever.effort = "high";
  expect(buildCodexRuntimeConfig(account, "", false, {})).toBe(
    [
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      'model_reasoning_effort = "high"',
      'model = "gpt-5"',
      "",
    ].join("\n"),
  );
});
