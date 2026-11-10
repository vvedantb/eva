import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type * as Helpers from "../convex/_sandbox_runtime/helpers";

/**
 * `/preview-auth` used to take the redirect origin from the link's `return`
 * param, so a crafted link sent a signed-in user's preview grant to any
 * `*.vercel.run` host. The backend now builds the redirect from the sandbox's
 * own preview origin; only the path comes from the caller.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const SANDBOX_ORIGIN = "https://sb-own-3000.vercel.run";

// The provider lookup is the only fake: the sandbox's real preview origin.
vi.mock("../convex/_sandbox_runtime/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof Helpers>()),
  getSandboxHandle: async () => ({
    previewUrl: async (port: number) => ({ url: SANDBOX_ORIGIN, port }),
  }),
}));

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(privateKey);
  vi.stubEnv("PREVIEW_GRANT_PRIVATE_KEY", JSON.stringify(jwk));
});

async function fixture() {
  const t = convexTest(schema, modules);
  const repoId = await t.run(async (ctx) => {
    const ann = await ctx.db.insert("users", {
      clerkId: "clerk|ann",
      email: "ann@a.example",
      firstName: "Ann",
    });
    const team = await ctx.db.insert("teams", {
      name: "A",
      createdBy: ann,
      createdAt: 0,
    });
    await ctx.db.insert("teamMembers", {
      teamId: team,
      userId: ann,
      role: "owner",
      joinedAt: 0,
    });
    const repo = await ctx.db.insert("githubRepos", {
      owner: "a",
      name: "app",
      installationId: 1,
      connectedBy: ann,
      teamId: team,
    });
    await ctx.db.insert("sessions", {
      repoId: repo,
      userId: ann,
      title: "Preview",
      status: "active",
      numId: 1,
      sandboxId: "sbx-own",
    });
    return repo;
  });
  return { ann: t.withIdentity({ subject: "clerk|ann" }), repoId };
}

test("the grant goes only to the sandbox's own preview origin", async () => {
  const { ann, repoId } = await fixture();
  const urls = await Promise.all(
    [
      "https://attacker.vercel.run/steal?x=1#h",
      "//attacker.vercel.run/steal?x=1#h",
      "/steal?x=1#h",
    ].map((path) =>
      ann.action(api.previewGrant.mintPreviewGrant, {
        sandboxId: "sbx-own",
        port: 3000,
        repoId: String(repoId),
        path,
      }),
    ),
  );
  for (const raw of urls) {
    const url = new URL(raw);
    expect(url.origin).toBe(SANDBOX_ORIGIN);
    expect(url.pathname).toBe("/steal");
    expect(url.searchParams.get("x")).toBe("1");
    expect(url.searchParams.get("__eva_grant")).toMatch(
      /^[\w-]+\.[\w-]+\.[\w-]+$/,
    );
    expect(url.hash).toBe("#h");
  }
}, 30_000);
