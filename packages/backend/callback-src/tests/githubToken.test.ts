import { describe, expect, it, test } from "vitest";
import {
  applyGithubTokenToEnv,
  ensureGithubToken,
  tokenFromActionResponse,
} from "../providers/githubToken.js";

describe("tokenFromActionResponse", () => {
  it("reads data.value.token", () => {
    expect(
      tokenFromActionResponse({
        value: { token: "ghs_abc" },
      }),
    ).toBe("ghs_abc");
  });

  it("rejects missing or non-string tokens", () => {
    expect(tokenFromActionResponse(null)).toBeNull();
    expect(tokenFromActionResponse({ value: "x" })).toBeNull();
    expect(tokenFromActionResponse({ value: { token: 1 } })).toBeNull();
  });
});

describe("ensureGithubToken", () => {
  it("skips when Convex credentials are missing", async () => {
    const result = await ensureGithubToken({
      convexUrl: undefined,
      convexToken: "t",
      repoId: "r",
    });
    expect(result).toEqual({ refreshed: false });
  });

  it("applies a fetched token onto the provided env", async () => {
    const env: { GITHUB_TOKEN?: string; GH_TOKEN?: string } = {};
    const result = await ensureGithubToken({
      convexUrl: "https://example.convex.cloud",
      convexToken: "convex-token",
      repoId: "repo-1",
      env,
      fetchFn: async () =>
        new Response(JSON.stringify({ value: { token: "ghs_from_convex" } }), {
          status: 200,
        }),
    });
    expect(result).toEqual({ refreshed: true });
    expect(env.GITHUB_TOKEN).toBe("ghs_from_convex");
    expect(env.GH_TOKEN).toBe("ghs_from_convex");
  });

  it("treats a non-OK response as a no-op", async () => {
    const env: { GITHUB_TOKEN?: string } = { GITHUB_TOKEN: "old" };
    const result = await ensureGithubToken({
      convexUrl: "https://example.convex.cloud",
      convexToken: "convex-token",
      repoId: "repo-1",
      env,
      fetchFn: async () => new Response("no", { status: 503 }),
    });
    expect(result).toEqual({ refreshed: false });
    expect(env.GITHUB_TOKEN).toBe("old");
  });
});

test("applyGithubTokenToEnv writes both names", () => {
  const env: { GITHUB_TOKEN?: string; GH_TOKEN?: string } = {};
  applyGithubTokenToEnv(env, "ghs_x");
  expect(env).toEqual({ GITHUB_TOKEN: "ghs_x", GH_TOKEN: "ghs_x" });
});
