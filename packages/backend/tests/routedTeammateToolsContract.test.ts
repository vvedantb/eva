import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

test("sandbox MCP registers list_work_profiles and ask_teammate", () => {
  const source = readFileSync(
    join(testsDir, "../convex/mcp/tools.ts"),
    "utf8",
  );
  expect(source).toContain('name: "list_work_profiles"');
  expect(source).toContain('name: "ask_teammate"');
  expect(source).toContain("internal.routedThreadRouting.askRouted");
  expect(source).toContain("Background they need before answering");
});
