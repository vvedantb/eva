import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildAveInstructions } from "../convex/_ave/prompt";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/**
 * Ave's allowlist lives in a "use node" module (`mcp/aveRun.ts`), so it is read
 * as source here rather than imported. The instructions must name every tool
 * Ave has — and nothing it no longer has: no shell, no logs, no repo.
 */
const aveRun = readFileSync(join(convexDir, "mcp/aveRun.ts"), "utf8");
const allowlist = aveRun.slice(
  aveRun.indexOf("export const AVE_TOOL_NAMES = ["),
  aveRun.indexOf("] as const;"),
);
const toolNames = [...allowlist.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

const instructions = buildAveInstructions({
  now: new Date("2026-09-26T00:00:00Z"),
  role: undefined,
  customInstructions: undefined,
});

describe("Manager Ave instructions", () => {
  test("the allowlist was found", () => {
    expect(toolNames.length).toBeGreaterThan(10);
  });

  test("name every tool Ave has", () => {
    for (const name of toolNames) expect(instructions).toContain(`\`${name}\``);
  });

  test("carry no shell, logs or sandbox guidance", () => {
    for (const banned of ["npx ", "gh ", "vercel logs", "/tmp/repo", "Bash", "home repo"]) {
      expect(instructions).not.toContain(banned);
    }
  });

  test("never offer excluded tools", () => {
    for (const excluded of ["send_chat_message", "start_sandbox", "render_ui", "send_email"]) {
      expect(toolNames).not.toContain(excluded);
      expect(instructions).not.toContain(`\`${excluded}\``);
    }
  });

  test("keep the user's custom instructions", () => {
    expect(
      buildAveInstructions({
        now: new Date(),
        role: undefined,
        customInstructions: "Always answer in French.",
      }),
    ).toContain("Always answer in French.");
  });
});

/**
 * `selectAveTools` throws at run time if an allowlisted tool is missing, which
 * would only surface as a failed Ave turn in production. Catch a rename here.
 */
describe("Manager Ave's allowlist", () => {
  const mcpSource = readdirSync(join(convexDir, "mcp"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(join(convexDir, "mcp", file), "utf8"))
    .join("\n");

  test("every allowlisted tool is defined", () => {
    for (const name of toolNames) {
      expect(mcpSource, `${name} is not defined`).toMatch(
        new RegExp(`name: "${name}"`),
      );
    }
  });
});
