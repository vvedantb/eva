import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

describe("backend authorization boundaries", () => {
  const repoGuardedActions = [
    "_github/prDiff.ts",
    "_github/prOverview.ts",
    "_github/prReview.ts",
    "_github/pullRequests.ts",
    "linearActions.ts",
    "pty.ts",
    "repoEnvVarsActions.ts",
    "taskWorkflowActions.ts",
  ];

  for (const path of repoGuardedActions) {
    it(`${path} resolves repository access before privileged work`, () => {
      expect(convexSource(path)).toContain("getActionRepoWithAccess");
    });
  }

  it("sandbox service actions require both repo access and sandbox binding", () => {
    expect(convexSource("_sandbox_runtime/services.ts")).toContain(
      "assertActionSandboxAccess",
    );
    expect(convexSource("_sandbox_runtime/execution.ts")).toContain(
      "assertActionSandboxAccess",
    );
  });

  /**
   * Repo access alone is not enough for these: the caller supplies both repoId
   * and sandboxId, so checking only the repo lets them pair a repo they own
   * with another tenant's sandbox and read its files. The File Viewer readers
   * shipped exactly that gap (fix d8eb560c9), and a file-level `toContain`
   * cannot see a *new* action that forgets the guard — so assert per export.
   */
  describe("every public action in _sandbox_runtime/services.ts", () => {
    const source = convexSource("_sandbox_runtime/services.ts");
    // Public `action({…})` only. internalAction is unreachable from a client.
    const exports = [...source.matchAll(/export const (\w+) = action\(\{/g)].map(
      (match) => ({ name: match[1], at: match.index }),
    );

    it("has public actions to check", () => {
      expect(exports.length).toBeGreaterThan(0);
    });

    for (const [index, entry] of exports.entries()) {
      const body = source.slice(entry.at, exports[index + 1]?.at ?? undefined);

      it(`${entry.name} asserts sandbox access before touching the sandbox`, () => {
        // authorizedRunningHandle is the shared wrapper; it calls the assert.
        const guardAt = Math.min(
          ...["assertActionSandboxAccess(", "authorizedRunningHandle("]
            .map((call) => body.indexOf(call))
            .filter((at) => at >= 0),
        );
        expect(
          Number.isFinite(guardAt),
          `${entry.name} never calls assertActionSandboxAccess — a caller ` +
            "can pair their own repoId with another tenant's sandboxId",
        ).toBe(true);

        // Repo access on its own is the weaker guard this replaced.
        expect(
          body,
          `${entry.name} authorizes off githubRepos.get, which does not bind ` +
            "the sandbox to the repo",
        ).not.toContain("api.githubRepos.get");

        for (const reach of ["getSandboxHandle(", "execHandle(", "sandbox.exec("]) {
          const reachAt = body.indexOf(reach);
          if (reachAt < 0) continue;
          expect(
            reachAt,
            `${entry.name} calls ${reach} before asserting sandbox access`,
          ).toBeGreaterThan(guardAt);
        }
      });
    }
  });

  /**
   * toggleSandboxExclude shipped without the guard its list/removeVar siblings
   * carry, so any signed-in user could flip whether another repo's env vars
   * reach its sandboxes (fix d8eb560c9). authMutation only proves a user is
   * signed in; the repoId still has to be checked against them.
   */
  describe("every repo-scoped env var function", () => {
    const source = convexSource("repoEnvVars.ts");
    const exports = [
      ...source.matchAll(/export const (\w+) = (authQuery|authMutation)\(\{/g),
    ].map((match) => ({ name: match[1], at: match.index }));

    it("has repo-scoped functions to check", () => {
      expect(exports.length).toBeGreaterThan(0);
    });

    for (const [index, entry] of exports.entries()) {
      const body = source.slice(entry.at, exports[index + 1]?.at ?? undefined);

      it(`${entry.name} resolves repo access before reading or writing`, () => {
        expect(body).toContain('repoId: v.id("githubRepos")');
        const guardAt = body.indexOf("getRepoWithAccess(ctx.db, args.repoId");
        expect(
          guardAt,
          `${entry.name} never calls getRepoWithAccess — being signed in is ` +
            "not access to this repo's env vars",
        ).toBeGreaterThan(-1);
        const readAt = body.indexOf("findByRepo(ctx.db, args.repoId)");
        if (readAt >= 0) {
          expect(
            readAt,
            `${entry.name} loads the env var document before the access check`,
          ).toBeGreaterThan(guardAt);
        }
      });
    }
  });

  // A client-supplied installation id can be any number GitHub ever issued, so
  // installations Eva has no row for must be proven against the caller's own
  // GitHub token rather than an installation token (which authenticates as the
  // App, across every installation it belongs to).
  it("unclaimed installations are verified with the caller's GitHub token", () => {
    const api = convexSource("_github/api.ts");
    expect(api).toContain("listInstallationReposForUser");
    expect(api).toContain("assertUserCanUseRepo");
    const userAuth = convexSource("_github/userAuth.ts");
    expect(userAuth).toContain("listInstallationReposForAuthenticatedUser");
    expect(userAuth).not.toContain("getInstallationOctokit");
  });

  it("connectRepo verifies GitHub access before binding a repo row", () => {
    const api = convexSource("_github/api.ts");
    const connect = api.slice(api.indexOf("export const connectRepo"));
    expect(connect.indexOf("assertUserCanUseRepo")).toBeLessThan(
      connect.indexOf("createForInstallation"),
    );
  });

  it("the repo create mutation refuses installations Eva does not know", () => {
    const mutations = convexSource("_githubRepos/mutations.ts");
    expect(mutations).toContain(
      "if (!installationRepos.some((repo) => repo.connectedBy === ctx.userId))",
    );
  });

  // GitHub answers OAuth failures with HTTP 200 and an error body, so a
  // hand-rolled fetch reads a failure as a success unless it parses for that.
  // Octokit already handles it; keep the exchange there.
  it("the OAuth token exchange goes through Octokit, not a raw fetch", () => {
    const userAuth = convexSource("_github/userAuth.ts");
    expect(userAuth).toContain("createToken");
    expect(userAuth).not.toContain("login/oauth/access_token");
  });

  it("GitHub user tokens stay server-side and are stored encrypted", () => {
    const tokens = convexSource("_github/userTokens.ts");
    expect(tokens).toContain("export const getStoredToken = internalQuery");
    expect(tokens).toContain("export const putStoredToken = internalMutation");
    const userAuth = convexSource("_github/userAuth.ts");
    expect(userAuth).toContain("encryptValue(token.accessToken)");
  });

  it("authorize-hop nonces are single-use", () => {
    const tokens = convexSource("_github/userTokens.ts");
    const consume = tokens.slice(
      tokens.indexOf("export const consumeOauthState"),
    );
    // Deleting before the expiry check is what makes a replay fail.
    expect(consume.indexOf("ctx.db.delete(row._id)")).toBeLessThan(
      consume.indexOf("row.expiresAt < Date.now()"),
    );
  });

  it("the GitHub OAuth callback identifies the user from the nonce alone", () => {
    const http = convexSource("http.ts");
    const callback = http.slice(
      http.indexOf('path: "/api/github/oauth/callback"'),
    );
    expect(callback).toContain("consumeOauthState");
    expect(callback).toContain("userId: claim.userId");
  });

  it("OAuth token exchange binds authorization codes to clients and S256", () => {
    const native = convexSource("mcp/native.ts");
    expect(native).toContain("entry.clientId !== params.client_id");
    expect(native).toContain('entry.codeChallengeMethod !== "S256"');
  });

  it("public session create ignores a client-supplied orchestrator flag", () => {
    const mutations = convexSource("_sessions/mutations.ts");
    const create = mutations.slice(mutations.indexOf("export const create = authMutation"));
    expect(create).toContain("isOrchestrator: _ignored");
    expect(create.indexOf("createSession(ctx, safeArgs)")).toBeGreaterThan(-1);
    expect(create.indexOf("createSession(ctx, args)")).toBe(-1);
  });

  it("docs.update checks repo access before patching", () => {
    const docs = convexSource("docs.ts");
    const update = docs.slice(docs.indexOf("export const update = authMutation"));
    expect(update.indexOf("hasRepoAccess")).toBeLessThan(update.indexOf("ctx.db.patch"));
  });

  it("streaming.get and pendingQuestions.getActive require entity access", () => {
    expect(convexSource("streaming.ts")).toContain("hasEntityAccess");
    expect(convexSource("pendingQuestions.ts")).toContain("assertEntityAccess");
  });

  it("installation tokens returned to clients are repository-scoped", () => {
    const api = convexSource("_github/api.ts");
    const action = api.slice(api.indexOf("export const getInstallationTokenAction"));
    expect(action).toContain("getRepoScopedInstallationToken");
    expect(action).not.toContain("getInstallationToken(");
    expect(convexSource("http.ts")).toContain("mintRepoScopedWriteToken");
  });

  it("assignToTeam requires the connector or source-team owner", () => {
    const mutations = convexSource("_githubRepos/mutations.ts");
    const assign = mutations.slice(
      mutations.indexOf("export const assignToTeam"),
    );
    expect(assign).toContain("repo.connectedBy !== ctx.userId");
    expect(assign).toContain('sourceMembership.role !== "owner"');
  });

  it("preview grants are bound to AUTH_PORT", () => {
    expect(convexSource("_sandbox_runtime/previewProxy.ts")).toContain(
      "payload.port !== AUTH_PORT",
    );
  });

  it("sandbox Supabase tokens honor scopedRepoId", () => {
    const resolve = convexSource("mcp/nodeActions.ts");
    expect(resolve).toContain("scopedRepoId: v.optional(v.string())");
    expect(convexSource("mcp/supabase.ts")).toContain(
      "scopedRepoId: credentials.scopedRepoId",
    );
  });
});
