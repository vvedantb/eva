import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const nodeActions = readSource("mcp/nodeActions.ts");
const native = readSource("mcp/native.ts");
const tools = readSource("mcp/tools.ts");

/**
 * Manager Ave's powers (`send_agent_message`, implicit watches on its thread)
 * hang off one credential field, `aveThreadId`. It used to be an HS256 token
 * claim a sandbox could carry; now only Ave's own server-side run may set it.
 * If any token path could produce it, any MCP client could speak as Ave.
 */
describe("only Manager Ave's own run can grant Ave's powers", () => {
  test("no token claim carries it", () => {
    const claims = sliceTo(
      nodeActions,
      "const internalTokenClaims = z.object({",
      "});",
    );
    expect(claims).not.toContain("orchestrator");
    expect(claims).not.toContain("aveThreadId");
  });

  test("verification and the MCP handler never produce it", () => {
    const verify = sliceTo(
      nodeActions,
      "export const verifyAccessToken",
      "\nexport ",
    );
    const handle = sliceTo(
      nodeActions,
      "export const handleMcpRequest",
      "\nexport ",
    );
    for (const body of [verify, handle, native]) {
      expect(body).not.toContain("aveThreadId");
      expect(body).not.toContain("isOrchestrator");
    }
  });

  test("the credential is set in exactly one place: mcp/aveRun.ts", () => {
    // Credentials are only ever built as the first argument to buildTools.
    const setters = convexFiles().filter((file) =>
      /buildTools\(\s*\{[^}]*aveThreadId/.test(readSource(file)),
    );
    expect(setters).toEqual(["mcp/aveRun.ts"]);
  });

  test("send_agent_message is registered once, behind the Ave gate", () => {
    expect(tools).toContain("const isAve = aveThreadId !== undefined;");
    const registerAt = tools.indexOf("tools.push(...orchestratorTools(");
    expect(registerAt, "the registration moved").toBeGreaterThan(-1);
    const guardAt = tools.lastIndexOf("if (isAve) {", registerAt);
    expect(guardAt, "the registration escaped its guard").toBeGreaterThan(-1);
    expect(tools.slice(guardAt, registerAt)).not.toContain("}");
    expect(
      tools.indexOf("tools.push(...orchestratorTools(", registerAt + 1),
    ).toBe(-1);
  });
});

/** Comments name the very shapes these rules pin, so they have to go first. */
function readSource(relativePath: string): string {
  return readFileSync(join(convexDir, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

function sliceTo(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start);
  expect(startAt, `${start} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = source.indexOf(end, startAt + start.length);
  return source.slice(startAt, endAt < 0 ? undefined : endAt);
}

function convexFiles(dir = convexDir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "_generated" || name === "node_modules") return [];
    if (statSync(path).isDirectory()) return convexFiles(path);
    return name.endsWith(".ts") ? [relative(convexDir, path)] : [];
  });
}
