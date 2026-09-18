import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const nodeActions = readSource("mcp/nodeActions.ts");
const sandboxJwt = readSource("sandboxJwt.ts");
const tools = readSource("mcp/tools.ts");
const toolShared = readSource("mcp/toolShared.ts");
const launchHelpers = readSource("_sandbox_runtime/helpers.ts");

/**
 * Orchestrator tools are authorised by one HS256 claim on the MCP-internal
 * token. Nothing else gates them, so the claim has to survive minting, parsing,
 * and the hand-off to buildTools — and must never appear on a normal launch.
 */
describe("the orchestrator claim survives the token round-trip", () => {
  const claims = objectBody(
    nodeActions,
    "const internalTokenClaims = z.object({",
  );

  test("the claims schema declares the claim", () => {
    // Zod strips undeclared keys, so an unlisted claim is silently dropped.
    expect(claims).toContain("orchestrator: z.boolean().optional()");
  });

  test("verification hands the claim on as isOrchestrator", () => {
    const verify = declarationBody(
      nodeActions,
      "export const verifyAccessToken",
    );
    expect(verify).toContain("claims.data.orchestrator");
    expect(verify).toContain("isOrchestrator: claims.data.orchestrator");
  });

  test("the credentials passed to buildTools carry it", () => {
    // McpCredentials lives in the shared leaf so orchestratorTools can import
    // it without closing an import cycle back into tools.ts.
    expect(toolShared).toContain("isOrchestrator?: boolean;");
  });
});

describe("minting only sets the claim when the launch is flagged", () => {
  const mint = declarationBody(
    sandboxJwt,
    "export const mintSandboxSessionTokens",
  );

  test("the flag is an optional mint argument", () => {
    expect(mint).toContain("isOrchestrator: v.optional(v.boolean())");
  });

  test("the claim is spread in conditionally, never written unset", () => {
    expect(mint).toContain(
      "...(args.isOrchestrator ? { orchestrator: true } : {})",
    );
    // A plain assignment would put `orchestrator: undefined|false` on every token.
    expect(mint).not.toContain("orchestrator: args.isOrchestrator");
  });

  test("the launch path reads the flag off the session it already fetched", () => {
    const launch = declarationBody(
      launchHelpers,
      "export async function signAndLaunchScript",
    );
    expect(launch).toContain(
      "...(launchSession?.isOrchestrator ? { isOrchestrator: true } : {})",
    );
  });
});

describe("orchestrator tools are registered only for the master", () => {
  test("the flag is compared strictly, not coerced", () => {
    expect(tools).toContain(
      "const isOrchestrator = credentials.isOrchestrator === true;",
    );
  });

  test("the single registration sits behind that flag", () => {
    const registerAt = tools.indexOf("tools.push(...orchestratorTools(");
    expect(registerAt, "the registration moved").toBeGreaterThan(-1);
    const guardAt = tools.lastIndexOf("if (isOrchestrator) {", registerAt);
    expect(guardAt, "the registration escaped its guard").toBeGreaterThan(-1);
    expect(
      tools.slice(guardAt, registerAt),
      "the guard must not close before the registration",
    ).not.toContain("}");
    expect(
      tools.indexOf("tools.push(...orchestratorTools(", registerAt + 1),
      "a second registration would need its own guard",
    ).toBe(-1);
  });
});

/**
 * The master's skill cannot rely on a per-repo install row: the orchestrator is
 * a property of the session, and its home repo need not have installed anything.
 */
describe("the eva-orchestrator skill reaches the master without an install", () => {
  test("the launch appends the stub for orchestrator launches only", () => {
    const launch = declarationBody(
      launchHelpers,
      "export async function signAndLaunchScript",
    );
    expect(launch).toContain('SYSTEM_SKILLS["eva-orchestrator"]');
    expect(launch).toContain("launchSession?.isOrchestrator === true");
  });

  test("get_skill serves the content off the claim, skipping resolveForMcp", () => {
    const bypassAt = tools.indexOf(
      'name === "eva-orchestrator" && isOrchestrator',
    );
    expect(bypassAt, "the get_skill bypass moved").toBeGreaterThan(-1);
    const resolveAt = tools.indexOf("internal.repoSystemSkills.resolveForMcp");
    expect(resolveAt, "the install-gated lookup moved").toBeGreaterThan(-1);
    expect(bypassAt).toBeLessThan(resolveAt);
    expect(tools.slice(bypassAt, resolveAt)).toContain(
      "buildEvaOrchestratorContent()",
    );
  });
});

/** Comments name the very shapes these rules pin, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** Slices an object literal from its opening line to the matching `});`. */
function objectBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = source.indexOf("});", startAt);
  expect(endAt, `${declaration} is not closed`).toBeGreaterThan(-1);
  return source.slice(startAt, endAt);
}

/** Slices from a declaration to the next top-level one. */
function declarationBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const nextAt = source.indexOf("\nexport ", startAt + 1);
  return source.slice(startAt, nextAt < 0 ? undefined : nextAt);
}
