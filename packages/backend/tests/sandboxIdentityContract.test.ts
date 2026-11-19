import { decodeJwt, exportJWK, generateKeyPair } from "jose";
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
import { signSandboxUserJwt } from "../convex/sandboxJwt";

/**
 * The in-VM daemon holds CONVEX_TOKEN, a JWT for the launching user, and agent
 * code in the VM can read it. MCP `runAsUser` signs a token with the same
 * issuer, so only the `evaMcp` claim on the MCP token tells the two apart.
 *
 * Fail-safe rule: `rejectSandboxCaller` goes only on functions that MCP and the
 * daemon never call. If Convex ever stopped surfacing the claim, MCP tokens
 * would look like VM tokens, and this rule means nothing legitimate breaks.
 * The rule is checked in review (callers listed in the PR), not here: tests
 * must not read source files (CLAUDE.md, Tests).
 */

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
  test("only the MCP token carries the claim; the VM token keeps 24h", async () => {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    process.env.SANDBOX_JWT_PRIVATE_KEY = JSON.stringify(
      await exportJWK(privateKey),
    );

    const mcp = decodeJwt(await signSandboxUserJwt("user_1", "mcp"));
    expect(mcp[EVA_MCP_CLAIM]).toBe(true);
    expect((mcp.exp ?? 0) - (mcp.iat ?? 0)).toBe(60 * 60);

    const vm = decodeJwt(await signSandboxUserJwt("user_1", "vm"));
    expect(vm[EVA_MCP_CLAIM]).toBeUndefined();
    expect((vm.exp ?? 0) - (vm.iat ?? 0)).toBe(24 * 60 * 60);
  });
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

  // A new Clerk account (unknown `sub`) whose token carries an existing
  // user's email address.
  const NEWCOMER: UserIdentity = {
    issuer: CLERK.issuer,
    subject: "user_newcomer",
    tokenIdentifier: `${CLERK.issuer}|user_newcomer`,
    email: "owner@example.com",
  };

  test.each([undefined, false])(
    "ensureUserExists does not rebind when email_verified is %s",
    async (emailVerified) => {
      const { t } = await fixture();
      const result = await t
        .withIdentity({ ...NEWCOMER, emailVerified })
        .mutation(api.auth.ensureUserExists, {});
      expect(result.wasCreated).toBe(true);
      const owner = await t.run((ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_clerk"))
          .first(),
      );
      expect(owner).not.toBeNull();
      expect(owner?._id).not.toBe(result.userId);
    },
    30_000,
  );

  test("ensureUserExists rebinds when email_verified is true", async () => {
    const { t } = await fixture();
    const result = await t
      .withIdentity({ ...NEWCOMER, emailVerified: true })
      .mutation(api.auth.ensureUserExists, {});
    const owner = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "owner@example.com"))
        .first(),
    );
    expect(result).toEqual({ userId: owner?._id, wasCreated: false });
    expect(owner?.clerkId).toBe("user_newcomer");
  }, 30_000);
});
