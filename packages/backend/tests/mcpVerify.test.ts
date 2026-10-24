import { convexTest } from "convex-test";
import { SignJWT } from "jose";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  authenticateMcpToken,
  isInternalToken,
  type McpPrincipal,
} from "../convex/mcp/authenticate";

type FakeAuth = {
  isAuthenticated: boolean;
  tokenType: string | null;
  userId?: string | null;
};

type FakeState =
  | { isAuthenticated: true; toAuth: () => FakeAuth }
  | { isAuthenticated: false; reason: string | null; message: string | null };

const clerk = vi.hoisted(() => {
  const created: Array<{ secretKey: string; publishableKey: string }> = [];
  const acceptsToken: string[][] = [];
  const state: { next: () => Promise<FakeState> } = {
    next: () => Promise.reject(new Error("no fake state set")),
  };
  return { created, acceptsToken, state };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: (options: {
    secretKey: string;
    publishableKey: string;
  }) => {
    clerk.created.push(options);
    return {
      authenticateRequest: (
        _request: Request,
        opts: { acceptsToken: string[] },
      ) => {
        clerk.acceptsToken.push(opts.acceptsToken);
        return clerk.state.next();
      },
    };
  },
}));

const bearer = vi.hoisted(() => ({
  authenticate: vi.fn<
    (options: { token: string }) => Promise<{ clerkUserId: string } | null>
  >(),
}));

vi.mock("@vvedantb/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vvedantb/server")>();
  return { ...actual, authenticateClerkBearer: bearer.authenticate };
});

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const INTERNAL_SECRET = "internal-test-secret-0123456789abcdef";

function signedIn(auth: FakeAuth): () => Promise<FakeState> {
  return () => Promise.resolve({ isAuthenticated: true, toAuth: () => auth });
}

function verify(token: string) {
  const t = convexTest(schema, modules);
  return t.action(internal.mcp.nodeActions.verifyAccessToken, { token });
}

function signToken(audience: string, claims: Record<string, string>) {
  return new SignJWT({ ...claims, repoId: "repo_1" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user_sandbox")
    .setIssuer("eva")
    .setAudience(audience)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(INTERNAL_SECRET));
}

let errors: MockInstance<typeof console.error>;

beforeEach(() => {
  clerk.created.length = 0;
  clerk.acceptsToken.length = 0;
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", "pk_test_fake");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://clerk.test");
  vi.stubEnv("MCP_INTERNAL_SECRET", INTERNAL_SECRET);
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verifyAccessToken: Clerk tokens", () => {
  test.each(["oauth_token", "session_token"])(
    "returns the Clerk user for %s",
    async (tokenType) => {
      clerk.state.next = signedIn({
        isAuthenticated: true,
        tokenType,
        userId: "user_abc",
      });
      expect(await verify("opaque_token")).toEqual({ clerkUserId: "user_abc" });
      expect(clerk.created).toEqual([
        { secretKey: "sk_test_fake", publishableKey: "pk_test_fake" },
      ]);
      expect(clerk.acceptsToken).toEqual([["oauth_token", "session_token"]]);
    },
    TIMEOUT_MS,
  );

  test(
    "returns null and logs when Clerk rejects the token",
    async () => {
      clerk.state.next = () =>
        Promise.resolve({
          isAuthenticated: false,
          reason: "token-invalid",
          message: "Token is expired",
        });
      expect(await verify("opaque_token")).toBeNull();
      expect(errors).toHaveBeenCalledWith(
        "[MCP][verifyAccessToken] authenticateRequest failed:",
        "token-invalid",
        "Token is expired",
      );
    },
    TIMEOUT_MS,
  );

  test.each<[string, FakeAuth]>([
    [
      "api_key token type",
      { isAuthenticated: true, tokenType: "api_key", userId: "user_abc" },
    ],
    [
      "empty userId",
      { isAuthenticated: true, tokenType: "oauth_token", userId: "" },
    ],
  ])(
    "returns null for %s",
    async (_label, auth) => {
      clerk.state.next = signedIn(auth);
      expect(await verify("opaque_token")).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "returns null when CLERK_SECRET_KEY is missing",
    async () => {
      vi.stubEnv("CLERK_SECRET_KEY", "");
      expect(await verify("opaque_token")).toBeNull();
      expect(clerk.created).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "returns null and logs when CLERK_PUBLISHABLE_KEY is missing",
    async () => {
      vi.stubEnv("CLERK_PUBLISHABLE_KEY", "");
      clerk.state.next = signedIn({
        isAuthenticated: true,
        tokenType: "oauth_token",
        userId: "user_abc",
      });
      expect(await verify("opaque_token")).toBeNull();
      expect(clerk.created).toEqual([]);
      expect(errors).toHaveBeenCalledWith(
        "[MCP][verifyAccessToken] threw:",
        expect.stringContaining("CLERK_PUBLISHABLE_KEY"),
      );
    },
    TIMEOUT_MS,
  );
});

describe("verifyAccessToken: mcp-internal tokens", () => {
  test(
    "keeps the sandbox scope and skips Clerk",
    async () => {
      const token = await signToken("mcp-internal", {
        entityId: "entity_1",
        entityKind: "session",
        chatId: "chat_1",
      });
      expect(await verify(token)).toEqual({
        clerkUserId: "user_sandbox",
        scopedRepoId: "repo_1",
        entityId: "entity_1",
        entityKind: "session",
        chatId: "chat_1",
      });
      expect(clerk.created).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "rejects the removed mcp-oauth audience",
    async () => {
      clerk.state.next = () =>
        Promise.resolve({
          isAuthenticated: false,
          reason: "token-invalid",
          message: null,
        });
      expect(await verify(await signToken("mcp-oauth", {}))).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "rejects a sandbox token signed with another secret",
    async () => {
      vi.stubEnv("MCP_INTERNAL_SECRET", "a-different-secret-0123456789abcdef");
      clerk.state.next = () =>
        Promise.resolve({
          isAuthenticated: false,
          reason: "token-invalid",
          message: null,
        });
      expect(await verify(await signToken("mcp-internal", {}))).toBeNull();
    },
    TIMEOUT_MS,
  );
});

describe("authenticateMcpToken", () => {
  const sandboxPrincipal: McpPrincipal = {
    clerkUserId: "user_sandbox",
    scopedRepoId: "repo_1",
    entityKind: "task",
  };

  test("sandbox tokens skip Clerk and keep their scope", async () => {
    const token = await signToken("mcp-internal", {});
    const runAction = vi.fn(() => Promise.resolve(sandboxPrincipal));
    expect(await authenticateMcpToken({ runAction }, token)).toBe(
      sandboxPrincipal,
    );
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledWith(
      internal.mcp.nodeActions.verifyAccessToken,
      { token },
    );
    expect(bearer.authenticate).not.toHaveBeenCalled();
  });

  test("other tokens go to authenticateClerkBearer", async () => {
    bearer.authenticate.mockResolvedValueOnce({ clerkUserId: "user_abc" });
    const runAction = vi.fn();
    expect(await authenticateMcpToken({ runAction }, "opaque_token")).toEqual({
      clerkUserId: "user_abc",
    });
    expect(bearer.authenticate).toHaveBeenCalledTimes(1);
    expect(bearer.authenticate.mock.calls[0]?.[0]).toMatchObject({
      token: "opaque_token",
      issuer: "https://clerk.test",
    });
    expect(runAction).not.toHaveBeenCalled();
  });
});

describe("isInternalToken", () => {
  test("is true only for the mcp-internal audience", async () => {
    expect(isInternalToken(await signToken("mcp-internal", {}))).toBe(true);
    expect(isInternalToken(await signToken("mcp-oauth", {}))).toBe(false);
    expect(isInternalToken("opaque_token")).toBe(false);
    expect(isInternalToken("a.not-base64!.c")).toBe(false);
  });
});
