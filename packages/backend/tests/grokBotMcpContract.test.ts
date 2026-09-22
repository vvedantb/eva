import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

test("request_local_computer is registered for every MCP caller", () => {
  const tools = convexSource("mcp/tools.ts");
  const registered = tools.indexOf('"request_local_computer"');
  const gate = tools.indexOf("if (isOrchestrator) {");
  expect(registered).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(registered);
});

test("the webhook caller returns only accepted + message", () => {
  const actions = convexSource("grokBotActions.ts");
  const call = actions.slice(actions.indexOf("export const callWebhook"));
  const returns = call.slice(
    call.indexOf("returns:"),
    call.indexOf("handler:"),
  );
  expect(returns).toContain("accepted: v.boolean()");
  expect(returns).toContain("message: v.string()");
  expect(returns).not.toContain("url");
  expect(returns).not.toContain("key");
  expect(call).toContain('redirect: "error"');
});
