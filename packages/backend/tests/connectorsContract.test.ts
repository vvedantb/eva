import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

describe("connector tables and launch wiring", () => {
  it("schema defines connectedAccounts and oauth states", () => {
    const schema = convexSource("schema.ts");
    expect(schema).toContain("connectedAccounts:");
    expect(schema).toContain("connectorOauthStates:");
  });

  it("linear import resolves OAuth before LINEAR_API_KEY", () => {
    const source = convexSource("linearActions.ts");
    expect(source).toContain("resolveConnectorToken");
    expect(source).toContain("Connect Linear");
  });

  it("sandbox launch injects connector MCP env", () => {
    const source = convexSource("_sandbox_runtime/helpers.ts");
    expect(source).toContain("resolveConnectorLaunchEnv");
  });

  it("http callback redeems connector oauth state", () => {
    const source = convexSource("http.ts");
    expect(source).toContain("/api/connectors/oauth/callback");
    expect(source).toContain("consumeOauthState");
  });
});
