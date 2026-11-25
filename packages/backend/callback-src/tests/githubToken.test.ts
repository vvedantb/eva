import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { stubEnv, unstubAllEnvs } from "../../tests/_helpers/env";
import { ensureGithubToken } from "../providers/githubToken.js";

const CREDENTIALS = {
  convexUrl: "https://example.convex.cloud",
  convexToken: "convex-token",
  repoId: "repo-1",
};

function respondWith(body: string, status = 200): void {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status }));
}

beforeEach(() => {
  stubEnv("GITHUB_TOKEN", "old");
  stubEnv("GH_TOKEN", "old");
});

afterEach(() => {
  mock.restore();
  unstubAllEnvs();
});

describe("ensureGithubToken", () => {
  it("writes the fetched token to both env names git and gh read", async () => {
    respondWith(JSON.stringify({ value: { token: "ghs_from_convex" } }));

    await expect(ensureGithubToken(CREDENTIALS)).resolves.toEqual({
      refreshed: true,
    });
    expect(process.env.GITHUB_TOKEN).toBe("ghs_from_convex");
    expect(process.env.GH_TOKEN).toBe("ghs_from_convex");
  });

  it("asks Convex for this repo's installation token with the sandbox token", async () => {
    respondWith(JSON.stringify({ value: { token: "ghs_x" } }));

    await ensureGithubToken(CREDENTIALS);

    expect(fetch).toHaveBeenCalledWith(
      "https://example.convex.cloud/api/action",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer convex-token",
        }),
        body: JSON.stringify({
          path: "github:getInstallationTokenAction",
          args: { repoId: "repo-1" },
          format: "json",
        }),
      }),
    );
  });

  it("does not call Convex when a credential is missing", async () => {
    respondWith("{}");

    for (const params of [
      { ...CREDENTIALS, convexUrl: undefined },
      { ...CREDENTIALS, convexToken: undefined },
      { ...CREDENTIALS, repoId: undefined },
    ]) {
      await expect(ensureGithubToken(params)).resolves.toEqual({
        refreshed: false,
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a non-OK response, even with a token body",
      JSON.stringify({ value: { token: "ghs_error_page" } }),
      503,
    ],
    ["malformed JSON", "{ nope", 200],
    ["a missing envelope", JSON.stringify(null), 200],
    ["a non-object value", JSON.stringify({ value: "x" }), 200],
    ["a non-string token", JSON.stringify({ value: { token: 1 } }), 200],
  ])("keeps the existing token on %s", async (_case, body, status) => {
    respondWith(body, status);

    await expect(ensureGithubToken(CREDENTIALS)).resolves.toEqual({
      refreshed: false,
    });
    expect(process.env.GITHUB_TOKEN).toBe("old");
    expect(process.env.GH_TOKEN).toBe("old");
  });

  it("keeps the existing token when the network fails", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket closed"));

    await expect(ensureGithubToken(CREDENTIALS)).resolves.toEqual({
      refreshed: false,
    });
    expect(process.env.GITHUB_TOKEN).toBe("old");
  });
});
