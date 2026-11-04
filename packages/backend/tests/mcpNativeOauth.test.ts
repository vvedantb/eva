import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

// Clerk is only asked whether the user still exists.
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: { getUser: (id: string) => Promise.resolve({ id }) },
  }),
}));

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const WEB_APP_URL = "https://eva.example";
const REDIRECT_URI = "http://127.0.0.1:53682/callback";
const VERIFIER = "a".repeat(64);

const registration = z.object({ client_id: z.string() });
const asMetadata = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string(),
});
const resourceMetadata = z.object({
  authorization_servers: z.array(z.string()),
});
const tokens = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal("Bearer"),
});

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

async function registerClient(t: ReturnType<typeof convexTest>) {
  const res = await t.fetch("/mcp/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Bee",
      redirect_uris: [REDIRECT_URI],
    }),
  });
  expect(res.status).toBe(201);
  return registration.parse(await res.json()).client_id;
}

function authorizeUrl(params: Record<string, string>): string {
  return `/mcp/oauth/authorize?${new URLSearchParams(params).toString()}`;
}

beforeEach(() => {
  vi.stubEnv("WEB_APP_URL", WEB_APP_URL);
  vi.stubEnv("MCP_JWT_SECRET", "oauth-test-secret-0123456789abcdef");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", "pk_test_fake");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Eva native MCP OAuth", () => {
  test(
    "metadata points clients at this origin, not Clerk",
    async () => {
      const t = convexTest(schema, modules);
      const metadata = asMetadata.parse(
        await (await t.fetch("/.well-known/oauth-authorization-server")).json(),
      );
      const origin = new URL(metadata.issuer).origin;
      expect(metadata).toMatchObject({
        authorization_endpoint: `${origin}/mcp/oauth/authorize`,
        token_endpoint: `${origin}/mcp/oauth/token`,
        registration_endpoint: `${origin}/mcp/oauth/register`,
      });
      const resource = resourceMetadata.parse(
        await (await t.fetch("/.well-known/oauth-protected-resource")).json(),
      );
      expect(resource.authorization_servers).toEqual([origin]);
    },
    TIMEOUT_MS,
  );

  test(
    "authorize without response_type or scope redirects to the SPA consent page",
    async () => {
      const t = convexTest(schema, modules);
      const clientId = await registerClient(t);
      const res = await t.fetch(
        authorizeUrl({
          client_id: clientId,
          redirect_uri: REDIRECT_URI,
          state: "state-1",
          code_challenge: await s256(VERIFIER),
          code_challenge_method: "S256",
          extra: "dropped",
        }),
        { redirect: "manual" },
      );
      expect(res.status).toBe(302);
      const target = new URL(res.headers.get("Location") ?? "");
      expect(`${target.origin}${target.pathname}`).toBe(
        `${WEB_APP_URL}/mcp/oauth/authorize`,
      );
      expect(target.searchParams.get("client_id")).toBe(clientId);
      expect(target.searchParams.get("state")).toBe("state-1");
      expect(target.searchParams.get("code_challenge")).toBe(
        await s256(VERIFIER),
      );
      expect(target.searchParams.has("extra")).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "authorize rejects a non-code response_type and unknown clients",
    async () => {
      const t = convexTest(schema, modules);
      const clientId = await registerClient(t);
      const base = {
        redirect_uri: REDIRECT_URI,
        state: "s",
        code_challenge: "c",
        code_challenge_method: "S256",
      };
      const implicit = await t.fetch(
        authorizeUrl({ ...base, client_id: clientId, response_type: "token" }),
        { redirect: "manual" },
      );
      expect(implicit.status).toBe(400);
      const unknownClient = await t.fetch(
        authorizeUrl({ ...base, client_id: "nope", response_type: "code" }),
        { redirect: "manual" },
      );
      expect(unknownClient.status).toBe(400);
    },
    TIMEOUT_MS,
  );

  test(
    "consent, token exchange and the issued token authenticate /mcp",
    async () => {
      const t = convexTest(schema, modules);
      const clientId = await registerClient(t);
      const { code } = await t
        .withIdentity({ subject: "user_bee" })
        .mutation(api.mcp.oauth.authorize, {
          clientId,
          redirectUri: REDIRECT_URI,
          codeChallenge: await s256(VERIFIER),
          codeChallengeMethod: "S256",
        });

      const exchange = (verifier: string) =>
        t.fetch("/mcp/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
            client_id: clientId,
          }).toString(),
        });

      const res = await exchange(VERIFIER);
      expect(res.status).toBe(200);
      const issued = tokens.parse(await res.json());

      // Codes are single use.
      expect((await exchange(VERIFIER)).status).toBe(400);

      const principal = await t.action(
        internal.mcp.nodeActions.verifyAccessToken,
        { token: issued.access_token },
      );
      expect(principal).toEqual({ clerkUserId: "user_bee" });

      const refresh = await t.fetch("/mcp/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: issued.refresh_token,
          client_id: clientId,
        }),
      });
      expect(refresh.status).toBe(200);
    },
    TIMEOUT_MS,
  );

  test(
    "token exchange rejects a wrong PKCE verifier",
    async () => {
      const t = convexTest(schema, modules);
      const clientId = await registerClient(t);
      const { code } = await t
        .withIdentity({ subject: "user_bee" })
        .mutation(api.mcp.oauth.authorize, {
          clientId,
          redirectUri: REDIRECT_URI,
          codeChallenge: await s256(VERIFIER),
          codeChallengeMethod: "S256",
        });
      const res = await t.fetch("/mcp/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: "b".repeat(64),
          client_id: clientId,
        }),
      });
      expect(res.status).toBe(400);
    },
    TIMEOUT_MS,
  );
});
