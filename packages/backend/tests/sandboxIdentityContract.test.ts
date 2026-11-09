import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  EVA_MCP_CLAIM,
  isSandboxIdentity,
  isSandboxVmIdentity,
  rejectSandboxCaller,
} from "../convex/_auth/sandboxIdentity";
import { SANDBOX_JWT_ISSUER } from "../convex/sandboxAuthConfig";

/**
 * The in-VM daemon holds CONVEX_TOKEN, a JWT for the launching user, and agent
 * code in the VM can read it. MCP `runAsUser` signs a token with the same
 * issuer, so only the `evaMcp` claim on the MCP token tells the two apart.
 *
 * Fail-safe rule: `rejectSandboxCaller` goes only on functions that MCP and the
 * daemon never call. If Convex ever stopped surfacing the claim, MCP tokens
 * would look like VM tokens, and this rule means nothing legitimate breaks.
 */

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const backendDir = join(convexDir, "..");

const CLERK: UserIdentity = {
  issuer: "https://clerk.example.com",
  subject: "user_clerk",
  tokenIdentifier: "https://clerk.example.com|user_clerk",
};
const VM: UserIdentity = {
  issuer: SANDBOX_JWT_ISSUER,
  subject: "user_clerk",
  tokenIdentifier: `${SANDBOX_JWT_ISSUER}|user_clerk`,
};
const MCP: UserIdentity = { ...VM, [EVA_MCP_CLAIM]: true };

function authCtx(identity: UserIdentity | null) {
  return { auth: { getUserIdentity: async () => identity } };
}

describe("sandbox identity helpers", () => {
  test("a Clerk identity is not a sandbox identity and passes", async () => {
    expect(isSandboxIdentity(CLERK)).toBe(false);
    expect(isSandboxVmIdentity(CLERK)).toBe(false);
    await expect(rejectSandboxCaller(authCtx(CLERK))).resolves.toBeUndefined();
  });

  test("the VM token (no claim) is rejected", async () => {
    expect(isSandboxIdentity(VM)).toBe(true);
    expect(isSandboxVmIdentity(VM)).toBe(true);
    await expect(rejectSandboxCaller(authCtx(VM))).rejects.toThrow(
      "Not available from a sandbox",
    );
  });

  test("the MCP token (claim true) passes", async () => {
    expect(isSandboxIdentity(MCP)).toBe(true);
    expect(isSandboxVmIdentity(MCP)).toBe(false);
    await expect(rejectSandboxCaller(authCtx(MCP))).resolves.toBeUndefined();
  });

  test("only a literal `true` claim marks MCP", () => {
    expect(isSandboxVmIdentity({ ...VM, [EVA_MCP_CLAIM]: "true" })).toBe(true);
    expect(isSandboxVmIdentity({ ...VM, [EVA_MCP_CLAIM]: false })).toBe(true);
  });

  test("an anonymous caller is not a sandbox caller", async () => {
    expect(isSandboxVmIdentity(null)).toBe(false);
    await expect(rejectSandboxCaller(authCtx(null))).resolves.toBeUndefined();
  });
});

describe("token minting", () => {
  test("the MCP runAsUser JWT carries the claim", () => {
    const source = read(join(convexDir, "mcp/nodeActions.ts"));
    const signer = source.slice(source.indexOf("async function signUserJwt"));
    expect(signer).toContain("[EVA_MCP_CLAIM]: true");
  });

  test("the VM launch JWT does not, so in-flight VM tokens keep their meaning", () => {
    const source = read(join(convexDir, "sandboxJwt.ts"));
    expect(source).not.toContain("EVA_MCP_CLAIM");
    expect(source).not.toContain("evaMcp");
  });
});

/** Public paths whose export must call rejectSandboxCaller first. */
const GUARDED = [
  "repoEnvVarsActions:revealValue",
  "repoEnvVarsActions:upsertVar",
  "teamEnvVarsActions:revealValue",
  "teamEnvVarsActions:upsertVar",
  "repoEnvVars:removeVar",
  "repoEnvVars:toggleSandboxExclude",
  "teamEnvVars:removeVar",
  "teamEnvVars:toggleSandboxExclude",
  "userProviderAccountsActions:upsert",
  "userProviderAccountsActions:revealValue",
  "userProviderAccounts:remove",
  "teams:remove",
  "teamMembers:add",
  "teamMembers:remove",
  "teamMembers:updateRole",
  "previewGrant:mintPreviewGrant",
  "_github/userTokens:startUserAuthorization",
  "_github/prOverview:mergePullRequest",
  "_github/prReview:submitPrReview",
  "_github/prReview:addPrComment",
];

const GUARD_CALL = "await rejectSandboxCaller(ctx);";

describe("rejectSandboxCaller placement", () => {
  for (const path of GUARDED) {
    test(`${path} rejects the VM token`, () => {
      expect(resolveExport(path), `${path} moved or was renamed`).toContain(
        GUARD_CALL,
      );
    });
  }

  test("the guarded list is exactly the set of functions that call it", () => {
    const callers = listFiles(convexDir)
      .filter((file) => !file.includes("_generated"))
      .flatMap((file) => {
        const source = read(file);
        const module = file.slice(convexDir.length + 1, -".ts".length);
        return exportBodies(source)
          .filter((entry) => entry.body.includes("rejectSandboxCaller("))
          .map((entry) => `${module}:${entry.name}`);
      });
    expect(callers.sort()).toEqual([...GUARDED].sort());
  });

  const mcpPaths = pathLiterals(
    listFiles(convexDir).filter((file) => {
      if (file.includes("_generated")) return false;
      if (file.startsWith(join(convexDir, "mcp"))) return true;
      const source = read(file);
      return source.includes("runAsUser(") || source.includes("mcpCallAsUser(");
    }),
  );
  const daemonPaths = [
    ...pathLiterals([
      ...listFiles(join(backendDir, "callback-src")),
      join(convexDir, "_sandbox_runtime/daemonPaths.ts"),
    ]),
    // Completion mutations reach the daemon through launch env, not literals
    // in callback-src.
    ...pathLiterals(listFiles(convexDir)).filter((path) =>
      /:handle\w*Completion$/.test(path),
    ),
  ];

  test("the caller scans found the known MCP and daemon paths", () => {
    expect(mcpPaths).toContain("auth:ensureUserExists");
    expect(mcpPaths).toContain("repoEnvVars:list");
    expect(mcpPaths).toContain("teamEnvVars:list");
    expect(daemonPaths).toContain("sessionWorkflow:claimPendingTurn");
    expect(daemonPaths).toContain("github:getInstallationTokenAction");
    expect(daemonPaths).toContain("usageLimits:report");
    expect(daemonPaths).toContain("sessionWorkflow:handleCompletion");
  });

  const callerSets: Array<[string, string[]]> = [
    ["MCP runAsUser", mcpPaths],
    ["the daemon", daemonPaths],
  ];
  for (const [caller, paths] of callerSets) {
    // Literals with no module file ("claude:sonnet", "node:fs") are not
    // function paths.
    const functionPaths = [...new Set(paths)].filter((path) =>
      existsSync(join(convexDir, `${path.split(":")[0]}.ts`)),
    );

    test(`every path ${caller} calls resolves to an export`, () => {
      expect(
        functionPaths.filter((path) => resolveExport(path) === null),
      ).toEqual([]);
    });

    test(`no function ${caller} calls rejects the VM token`, () => {
      expect(
        functionPaths.filter((path) =>
          resolveExport(path)?.includes("rejectSandboxCaller("),
        ),
      ).toEqual([]);
    });
  }
});

describe("guards end to end", () => {
  const modules = import.meta.glob("../convex/**/*.ts");

  async function fixture() {
    const t = convexTest(schema, modules);
    const repoId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "user_clerk",
        email: "owner@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
      });
      return ctx.db.insert("githubRepos", {
        owner: "vvedantb",
        name: "eva",
        installationId: 1,
        connectedBy: userId,
      });
    });
    return { t, repoId };
  }

  test("toggleSandboxExclude: VM rejected, Clerk and MCP pass", async () => {
    const { t, repoId } = await fixture();
    const args = { repoId, key: "SECRET", sandboxExclude: false };
    await expect(
      t.withIdentity(VM).mutation(api.repoEnvVars.toggleSandboxExclude, args),
    ).rejects.toThrow("Not available from a sandbox");
    await expect(
      t.withIdentity(MCP).mutation(api.repoEnvVars.toggleSandboxExclude, args),
    ).resolves.toBeNull();
    await expect(
      t
        .withIdentity(CLERK)
        .mutation(api.repoEnvVars.toggleSandboxExclude, args),
    ).resolves.toBeNull();
  }, 30_000);

  test("ensureUserExists from a sub-only token keeps the stored profile", async () => {
    const { t } = await fixture();
    for (const identity of [MCP, VM]) {
      const result = await t
        .withIdentity(identity)
        .mutation(api.auth.ensureUserExists, {});
      expect(result.wasCreated).toBe(false);
    }
    const user = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_clerk"))
        .first(),
    );
    expect(user).toMatchObject({
      email: "owner@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
    });
  }, 30_000);

  test("ensureUserExists still applies claims the token does carry", async () => {
    const { t } = await fixture();
    await t
      .withIdentity({ ...CLERK, email: "new@example.com", name: "Ada King" })
      .mutation(api.auth.ensureUserExists, {});
    const user = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_clerk"))
        .first(),
    );
    expect(user).toMatchObject({
      email: "new@example.com",
      firstName: "Ada",
      fullName: "Ada King",
    });
  }, 30_000);
});

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"))
    .map((entry) => join(dir, entry));
}

/** Every `"module/path:fn"` string literal in the given files. */
function pathLiterals(files: string[]): string[] {
  return files.flatMap((file) =>
    [...read(file).matchAll(/["'`]([A-Za-z_][\w/]*:[A-Za-z_]\w*)["'`]/g)].map(
      (match) => match[1],
    ),
  );
}

/** Each `export const name = …` and its source up to the next export. */
function exportBodies(source: string): Array<{ name: string; body: string }> {
  const starts = [...source.matchAll(/^export const (\w+) = /gm)];
  return starts.map((match) => {
    const next = source.indexOf("\nexport ", match.index + 1);
    return {
      name: match[1],
      body: source.slice(match.index, next < 0 ? undefined : next),
    };
  });
}

/**
 * Source of the export behind a public path ("github:mergePullRequest"),
 * following `export { a as b } from` and `export * from` re-exports. Null when
 * the module does not exist.
 */
function resolveExport(path: string): string | null {
  const [module, name] = path.split(":");
  return exportSource(join(convexDir, `${module}.ts`), name);
}

function exportSource(file: string, name: string): string | null {
  if (!existsSync(file)) return null;
  const source = read(file);
  const own = exportBodies(source).find((entry) => entry.name === name);
  if (own) return own.body;
  for (const match of source.matchAll(
    /export \{([^}]*)\} from "(\.[^"]+)";/g,
  )) {
    for (const spec of match[1].split(",")) {
      const [local, exported = local] = spec.trim().split(/\s+as\s+/);
      if (exported === name) {
        return exportSource(join(dirname(file), `${match[2]}.ts`), local);
      }
    }
  }
  for (const match of source.matchAll(/export \* from "(\.[^"]+)";/g)) {
    const found = exportSource(join(dirname(file), `${match[1]}.ts`), name);
    if (found !== null) return found;
  }
  return null;
}
