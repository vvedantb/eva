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
  it("installations are verified with the caller's GitHub token", () => {
    const api = convexSource("_github/api.ts");
    expect(api).toContain("listInstallationReposForUser");
    expect(api).toContain("assertUserCanUseRepo");
    const list = api.slice(api.indexOf("export const listRepos"));
    expect(list).not.toContain("listReposAccessibleToInstallation");
    const connect = api.slice(api.indexOf("export const connectRepo"));
    expect(connect.indexOf("assertUserCanUseRepo")).toBeGreaterThan(-1);
    expect(connect).not.toContain('accessState === "unclaimed"');
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

  it("the repo create mutation only adds sibling apps of an accessible GitHub repo", () => {
    const mutations = convexSource("_githubRepos/mutations.ts");
    const create = mutations.slice(mutations.indexOf("export const create ="));
    expect(create).toContain("repo.owner === args.owner && repo.name === args.name");
    expect(create).toContain("hasTeamAccess");
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

  it("startDevelopment and createFromTasks require project and task access", () => {
    const source = convexSource("_projects/development.ts");
    const start = source.slice(source.indexOf("export const startDevelopment"));
    expect(start.indexOf("getProjectWithAccess")).toBeGreaterThan(-1);
    expect(start.indexOf("getProjectWithAccess")).toBeLessThan(
      start.indexOf("ctx.db.insert"),
    );
    const create = source.slice(source.indexOf("export const createFromTasks"));
    expect(create).toContain("hasRepoAccess");
    expect(create).toContain("hasTaskAccess");
    expect(create).toContain("task.repoId !== args.repoId");
  });

  it("task workflow completion and trigger require task access", () => {
    const source = convexSource("_taskWorkflow/publicMutations.ts");
    const completion = source.slice(
      source.indexOf("export const handleCompletion"),
    );
    expect(completion.indexOf("hasTaskAccess")).toBeGreaterThan(-1);
    expect(completion.indexOf("hasTaskAccess")).toBeLessThan(
      completion.indexOf("sendCompletionEvent"),
    );
    const trigger = source.slice(
      source.indexOf("export const triggerExecution"),
    );
    expect(trigger).toContain("hasTaskAccess");
    expect(trigger).toContain("hasRepoAccess");
  });

  it("public updateSandbox ignores a client-supplied sandboxId", () => {
    const source = convexSource("_sessions/sandbox.ts");
    const update = source.slice(source.indexOf("export const updateSandbox"));
    expect(update).toContain("getSessionWithAccess");
    expect(update).not.toMatch(/updates\.sandboxId\s*=\s*args\.sandboxId/);
  });

  it("assignToProject and reorderProjectTasks require same-repo task access", () => {
    const source = convexSource("_agentTasks/mutations.ts");
    const assign = source.slice(source.indexOf("export const assignToProject"));
    expect(assign).toContain("hasTaskAccess");
    expect(assign).toContain("task.repoId !== project.repoId");
    const reorder = source.slice(
      source.indexOf("export const reorderProjectTasks"),
    );
    expect(reorder).toContain("task.projectId !== args.projectId");
    expect(reorder).toContain("hasTaskAccess");
  });

  it("sandbox auto-stop writes require isAdmin", () => {
    const source = convexSource("sandboxAutoStop.ts");
    const set = source.slice(
      source.indexOf("export const setSandboxAutoStopSettings"),
    );
    expect(set.indexOf("isAdmin")).toBeGreaterThan(-1);
    expect(set.indexOf("isAdmin")).toBeLessThan(set.indexOf("ctx.db.patch"));
  });

  it("summarizeWorkflow authorizes via session repo access", () => {
    const source = convexSource("summarizeWorkflow.ts");
    expect(source).toContain("getSessionWithAccess");
    expect(source).not.toContain("session.userId !== ctx.userId");
  });

  it("prosemirrorSync and assertDocAccess hide soft-deleted docs", () => {
    expect(convexSource("prosemirrorSync.ts")).toContain("assertDocAccess");
    expect(convexSource("_auth/entityAccess.ts")).toContain("isEntityDeleted");
  });

  it("completeSyntheticTurn requires entity access", () => {
    const session = convexSource("_sessions/workflow.ts");
    const sessionComplete = session.slice(
      session.indexOf("export const completeSyntheticTurn"),
    );
    expect(sessionComplete.indexOf("getSessionWithAccess")).toBeGreaterThan(-1);
    const task = convexSource("_chat/taskChatDaemon.ts");
    expect(
      task
        .slice(task.indexOf("export const completeSyntheticTurn"))
        .indexOf("getTaskWithAccess"),
    ).toBeGreaterThan(-1);
    const project = convexSource("_chat/projectChatDaemon.ts");
    expect(
      project
        .slice(project.indexOf("export const completeSyntheticTurn"))
        .indexOf("getProjectWithAccess"),
    ).toBeGreaterThan(-1);
  });

  it("PR-closed webhook binds the branch fallback to the webhook repository", () => {
    const webhook = convexSource("githubWebhook.ts");
    expect(webhook).toContain("runMatchesGithubRepo");
    expect(convexSource("http.ts")).toContain("repoOwner:");
  });

  it("updatePtySession requires session access", () => {
    const pty = convexSource("_sessions/pty.ts");
    const update = pty.slice(pty.indexOf("export const updatePtySession"));
    expect(update.indexOf("getSessionWithAccess")).toBeGreaterThan(-1);
    expect(update.indexOf("getSessionWithAccess")).toBeLessThan(
      update.indexOf("applyPtySession"),
    );
  });

  it("drafts stay owner-only through hasTaskAccess", () => {
    const access = convexSource("functions.ts");
    expect(access).toContain('task.status === "draft"');
    expect(access).toContain("task.createdBy !== userId");
    const byNum = convexSource("_agentTasks/queries.ts");
    const getByNum = byNum.slice(byNum.indexOf("export const getByNumId"));
    expect(getByNum.indexOf("hasTaskAccess")).toBeGreaterThan(-1);
  });

  it("session writes use hasSessionAccess and sandbox bind checks visibility", () => {
    expect(convexSource("functions.ts")).toContain("hasSessionAccess");
    expect(convexSource("_sessions/execution.ts")).toContain("hasSessionAccess");
    expect(convexSource("_sessions/mutations.ts")).toContain("hasSessionAccess");
    expect(convexSource("sandboxHeal.ts")).toContain("isBoundAndVisible");
    expect(convexSource("functions.ts")).toContain(
      "internal.sandboxHeal.isBoundAndVisible",
    );
  });

  it("task chat and project lists hide other users' drafts", () => {
    expect(convexSource("_chat/taskChatDaemon.ts")).toContain("hasTaskAccess");
    expect(convexSource("agentTaskChatWorkflow.ts")).toContain("hasTaskAccess");
    const list = convexSource("_agentTasks/queries.ts");
    const byProject = list.slice(list.indexOf("export const listByProject"));
    expect(byProject.indexOf("hasTaskAccess")).toBeGreaterThan(-1);
  });

  it("listSiblingApps only returns siblings the caller can access", () => {
    const source = convexSource("_githubRepos/queries.ts");
    const list = source.slice(source.indexOf("export const listSiblingApps"));
    expect(list).toContain("userCanAccessRepo(ctx.db, ctx.userId, sibling)");
  });

  it("orchestrator sessions are owner-only", () => {
    expect(convexSource("functions.ts")).toContain("sessionVisibleToUser");
    const sessions = convexSource("_sessions/queries.ts");
    expect(sessions).toContain("sessionVisibleToUser");
    const get = sessions.slice(sessions.indexOf("export const get ="));
    expect(get.indexOf("sessionVisibleToUser")).toBeGreaterThan(-1);
  });

  it("unscoped MCP Supabase resolve does not walk every repo", () => {
    const resolve = convexSource("mcp/nodeActions.ts");
    const fn = resolve.slice(resolve.indexOf("export const resolveSupabaseToken"));
    expect(fn).toContain("scopedRepoId === undefined");
    expect(fn).not.toContain("by_connected_by");
  });

  it("repo create cannot bind a new GitHub repo onto another team as a member", () => {
    const mutations = convexSource("_githubRepos/mutations.ts");
    expect(mutations).toContain(
      "Only team owners can assign a repository to a team",
    );
  });

  it("snapshot config files stay on the same team", () => {
    const source = convexSource("sandboxConfigFiles.ts");
    expect(source).toContain("sibling.teamId === anchorRepo.teamId");
  });

  it("preview nav-sync fails closed without a parent origin", () => {
    const proxy = convexSource("_sandbox_runtime/previewProxy.ts");
    expect(proxy).toContain("ancestorOrigins");
    expect(proxy).toContain("if (!parentOrigin) return");
    expect(proxy).toContain("event.origin !== parentOrigin");
  });

  it("MCP chat resolve hides another user's orchestrator session", () => {
    const queries = convexSource("mcp/queries.ts");
    const resolve = queries.slice(
      queries.indexOf("export const resolveChatTargetForUser"),
    );
    expect(resolve).toContain("isOrchestrator === true");
    expect(resolve).toContain("hit.doc.userId !== userId");
    expect(resolve).toContain("hasTaskAccess");
  });

  it("PTY connections require sandbox visibility, not just repo access", () => {
    expect(convexSource("pty.ts")).toContain("assertActionSandboxAccess");
    expect(convexSource("pty.ts")).not.toContain("getActionRepoWithAccess");
  });

  it("session daemon claims use hasSessionAccess for non-owners", () => {
    const workflow = convexSource("_sessions/workflow.ts");
    const claim = workflow.slice(workflow.indexOf("export const claimPendingTurn"));
    expect(claim).toContain("hasSessionAccess");
    expect(claim).not.toContain("hasRepoAccess");
  });

  it("task sandbox start and PR creation honor draft access", () => {
    expect(convexSource("_agentTasks/sandbox.ts")).toContain("hasTaskAccess");
    expect(convexSource("_agentTasks/sandbox.ts")).not.toContain("hasRepoAccess");
    expect(convexSource("taskWorkflowActions.ts")).toContain("api.agentTasks.get");
  });

  it("PR recaps stay on the same Eva team as the caller repo", () => {
    expect(convexSource("_githubRepos/helpers.ts")).toContain("isSameTeamSibling");
    expect(convexSource("docs.ts")).toContain("findSameTeamSiblingRepoIds");
  });

  it("changelog title is reserved and oldest match wins", () => {
    expect(convexSource("changelog.ts")).toContain("_creationTime < oldest._creationTime");
    expect(convexSource("_automations/crud.ts")).toContain(
      "That automation title is reserved",
    );
  });

  it("team updateRole cannot demote the last owner", () => {
    const source = convexSource("teamMembers.ts");
    const update = source.slice(source.indexOf("export const updateRole"));
    expect(update).toContain("Cannot remove the last owner from the team");
  });
});
