import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { listReadableSiblingRepos } from "../convex/_githubRepos/sandboxRead";

/**
 * A sandbox's git credential helper sends the repository git asked about, so
 * the backend can hand a read-only single-repo token for a sibling codebase
 * the sandbox owner can reach in eva — and nothing else. These tests pin who
 * gets a token, who gets 403, and that the home repo keeps its full token.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testsDir = dirname(fileURLToPath(import.meta.url));

const SECRET = "sandbox-secret-abc";
const SANDBOX_ID = "sbx_home";

/** Home repo the sandbox is bound to, plus one sibling repo shared by a team. */
async function fixture(options: {
  entity?: "session" | "task" | "project";
  siblingHidden?: boolean;
  siblingConnectedFalse?: boolean;
  siblingExcluded?: boolean;
  siblingOwnedByConnector?: boolean;
  ownerInTeam?: boolean;
}) {
  const entityKind = options.entity ?? "session";
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerUserId = await ctx.db.insert("users", {
      clerkId: "clerk|sibling-read-owner",
    });
    const strangerUserId = await ctx.db.insert("users", {});

    const teamId = await ctx.db.insert("teams", {
      name: "Shared team",
      createdBy: strangerUserId,
      createdAt: now,
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userId: strangerUserId,
      role: "owner",
      joinedAt: now,
    });
    if (options.ownerInTeam !== false) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: ownerUserId,
        role: "member",
        joinedAt: now,
      });
    }

    const homeRepoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      githubId: 111,
      connectedBy: ownerUserId,
    });
    const siblingRepoId = await ctx.db.insert("githubRepos", {
      owner: "AcmeOrg",
      name: "design-system",
      installationId: 2,
      githubId: 222,
      ...(options.siblingOwnedByConnector
        ? { connectedBy: ownerUserId }
        : { teamId }),
      ...(options.siblingHidden ? { hidden: true } : {}),
      ...(options.siblingConnectedFalse ? { connected: false } : {}),
      ...(options.siblingExcluded ? { sandboxReadExcluded: true } : {}),
    });

    await ctx.db.insert("sandboxGitCredentials", {
      sandboxId: SANDBOX_ID,
      installationId: 1,
      secret: SECRET,
      createdAt: now,
    });

    if (entityKind === "session") {
      await ctx.db.insert("sessions", {
        repoId: homeRepoId,
        userId: ownerUserId,
        title: "Sibling read session",
        status: "active",
        sandboxId: SANDBOX_ID,
      });
    } else if (entityKind === "task") {
      await ctx.db.insert("agentTasks", {
        repoId: homeRepoId,
        title: "Sibling read task",
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
        createdBy: ownerUserId,
        sandboxId: SANDBOX_ID,
      });
    } else {
      await ctx.db.insert("projects", {
        repoId: homeRepoId,
        userId: ownerUserId,
        title: "Sibling read project",
        phase: "in_progress",
        rawInput: "build it",
        sandboxId: SANDBOX_ID,
      });
    }

    return { ownerUserId, homeRepoId, siblingRepoId, teamId };
  });
  return { t, ids };
}

function resolve(
  t: Awaited<ReturnType<typeof fixture>>["t"],
  path?: string,
  secret: string = SECRET,
) {
  return t.query(internal.sandboxGitCredentials.resolveCredentialRequest, {
    secret,
    ...(path === undefined ? {} : { path }),
  });
}

describe("resolveCredentialRequest — home repository", () => {
  test("no path keeps today's full installation token", async () => {
    const { t } = await fixture({});
    expect(await resolve(t)).toEqual({ kind: "home", installationId: 1 });
  });

  test("empty path is treated as the home repository", async () => {
    const { t } = await fixture({});
    expect(await resolve(t, "")).toEqual({ kind: "home", installationId: 1 });
  });

  test.each([
    "vvedantb/eva",
    "vvedantb/eva.git",
    "/vvedantb/eva.git",
    "VVedantB/EVA.git",
  ])("path %s resolves to the home repository", async (path) => {
    const { t } = await fixture({});
    expect(await resolve(t, path)).toEqual({ kind: "home", installationId: 1 });
  });
});

describe("resolveCredentialRequest — sibling repositories", () => {
  test("team-shared sibling gets a scoped read token", async () => {
    const { t, ids } = await fixture({});
    expect(await resolve(t, "AcmeOrg/design-system.git")).toEqual({
      kind: "sibling",
      installationId: 2,
      owner: "AcmeOrg",
      name: "design-system",
      githubId: 222,
      sandboxId: SANDBOX_ID,
      userId: ids.ownerUserId,
    });
  });

  test("sibling the owner connected directly (no team) is readable", async () => {
    const { t } = await fixture({ siblingOwnedByConnector: true });
    const result = await resolve(t, "acmeorg/design-system");
    expect(result.kind).toBe("sibling");
  });

  test("sibling in a team the owner is not in is denied", async () => {
    const { t } = await fixture({ ownerInTeam: false });
    expect(await resolve(t, "AcmeOrg/design-system.git")).toEqual({
      kind: "denied",
      reason: "no access to AcmeOrg/design-system",
    });
  });

  test("sandboxReadExcluded on any app row denies the whole repository", async () => {
    const { t, ids } = await fixture({});
    await t.run(async (ctx) => {
      // Second app row of the same GitHub repo carries the opt-out.
      await ctx.db.insert("githubRepos", {
        owner: "AcmeOrg",
        name: "design-system",
        installationId: 2,
        githubId: 222,
        rootDirectory: "packages/tokens",
        teamId: ids.teamId,
        sandboxReadExcluded: true,
      });
    });
    expect(await resolve(t, "AcmeOrg/design-system.git")).toEqual({
      kind: "denied",
      reason: "no access to AcmeOrg/design-system",
    });
  });

  test("opt-out set on the requested row itself is denied", async () => {
    const { t } = await fixture({ siblingExcluded: true });
    expect((await resolve(t, "AcmeOrg/design-system")).kind).toBe("denied");
  });

  test("hidden-only sibling is denied", async () => {
    const { t } = await fixture({ siblingHidden: true });
    expect((await resolve(t, "AcmeOrg/design-system")).kind).toBe("denied");
  });

  test("disconnected-only sibling is denied", async () => {
    const { t } = await fixture({ siblingConnectedFalse: true });
    expect((await resolve(t, "AcmeOrg/design-system")).kind).toBe("denied");
  });

  test("a connected sibling row rescues a hidden parent row", async () => {
    const { t, ids } = await fixture({ siblingHidden: true });
    await t.run(async (ctx) => {
      await ctx.db.insert("githubRepos", {
        owner: "AcmeOrg",
        name: "design-system",
        installationId: 2,
        githubId: 222,
        rootDirectory: "packages/tokens",
        teamId: ids.teamId,
      });
    });
    expect((await resolve(t, "AcmeOrg/design-system")).kind).toBe("sibling");
  });

  test("a repository eva does not know is denied", async () => {
    const { t } = await fixture({});
    expect(await resolve(t, "someone/unknown.git")).toEqual({
      kind: "denied",
      reason: "no access to someone/unknown",
    });
  });

  test("an unknown secret is denied", async () => {
    const { t } = await fixture({});
    expect(await resolve(t, "AcmeOrg/design-system", "nope")).toEqual({
      kind: "denied",
      reason: "unknown secret",
    });
  });

  test("a sandbox bound to no entity cannot ask about another repo", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("sandboxGitCredentials", {
        sandboxId: "sbx_orphan",
        installationId: 9,
        secret: SECRET,
        createdAt: Date.now(),
      });
    });
    expect(
      await t.query(internal.sandboxGitCredentials.resolveCredentialRequest, {
        secret: SECRET,
        path: "AcmeOrg/design-system.git",
      }),
    ).toEqual({
      kind: "denied",
      reason: "sandbox not bound to an entity",
    });
  });
});

describe("resolveCredentialRequest — entity kinds", () => {
  test.each(["session", "task", "project"] as const)(
    "sandbox bound via a %s resolves its owner",
    async (entity) => {
      const { t, ids } = await fixture({ entity });
      const result = await resolve(t, "AcmeOrg/design-system.git");
      expect(result).toMatchObject({
        kind: "sibling",
        installationId: 2,
        userId: ids.ownerUserId,
      });
    },
  );
});

describe("listReadableSiblingRepos", () => {
  test("dedupes app rows of one repository and drops the home repo", async () => {
    const { t, ids } = await fixture({});
    await t.run(async (ctx) => {
      await ctx.db.insert("githubRepos", {
        owner: "AcmeOrg",
        name: "design-system",
        installationId: 2,
        githubId: 222,
        rootDirectory: "packages/tokens",
        teamId: ids.teamId,
      });
      // A second app row of the home repo must not leak back in either.
      await ctx.db.insert("githubRepos", {
        owner: "vvedantb",
        name: "eva",
        installationId: 1,
        githubId: 111,
        rootDirectory: "packages/backend",
        connectedBy: ids.ownerUserId,
      });
    });

    const readable = await t.run(async (ctx) =>
      listReadableSiblingRepos(ctx.db, ids.ownerUserId, ids.homeRepoId),
    );
    expect(readable).toEqual([
      {
        owner: "AcmeOrg",
        name: "design-system",
        installationId: 2,
        githubId: 222,
      },
    ]);
  });

  test("sorts by owner/name", async () => {
    const { t, ids } = await fixture({});
    await t.run(async (ctx) => {
      await ctx.db.insert("githubRepos", {
        owner: "zeta",
        name: "tools",
        installationId: 3,
        teamId: ids.teamId,
      });
    });
    const readable = await t.run(async (ctx) =>
      listReadableSiblingRepos(ctx.db, ids.ownerUserId, ids.homeRepoId),
    );
    expect(readable.map((repo) => `${repo.owner}/${repo.name}`)).toEqual([
      "AcmeOrg/design-system",
      "zeta/tools",
    ]);
  });

  test("a repo the user cannot reach never appears", async () => {
    const { t, ids } = await fixture({});
    const strangerRepoId: Id<"githubRepos"> = await t.run(async (ctx) => {
      const strangerUserId = await ctx.db.insert("users", {});
      return await ctx.db.insert("githubRepos", {
        owner: "stranger",
        name: "private",
        installationId: 4,
        connectedBy: strangerUserId,
      });
    });
    const readable = await t.run(async (ctx) =>
      listReadableSiblingRepos(ctx.db, ids.ownerUserId, ids.homeRepoId),
    );
    expect(strangerRepoId).toBeDefined();
    expect(readable.some((repo) => repo.owner === "stranger")).toBe(false);
  });
});

describe("in-sandbox credential helper contract", () => {
  const source = readFileSync(
    join(testsDir, "../convex/_sandbox_runtime/gitCredentials.ts"),
    "utf8",
  );

  test("git is configured to send the repository path", () => {
    expect(source).toContain("useHttpPath true");
  });

  test("the token cache is keyed per requested path", () => {
    expect(source).toContain("git-cred-cache-");
  });

  test("the requested path is posted as JSON built by jq", () => {
    expect(source).toContain("{path:$p}");
  });
});
