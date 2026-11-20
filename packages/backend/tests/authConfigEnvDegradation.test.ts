import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { stubEnv, unstubAllEnvs } from "./_helpers/env";

/** Both modules read env at import time, so each test evaluates them afresh. */
function resetAuthModules(): void {
  delete require.cache[require.resolve("../convex/sandboxAuthConfig")];
  delete require.cache[require.resolve("../convex/auth.config")];
}

/**
 * `auth.config.ts` is evaluated during module analysis, so anything it throws
 * fails the whole push. A freshly created local backend has no env vars until
 * the snapshot seed copies them in, and the seed runs after the gate that waits
 * on that push — so a throw here was unrecoverable, and every scheduled
 * snapshot build sat at the gate for fifteen minutes and failed (fix e5c1f018).
 *
 * The rule these tests hold: a missing auth env var costs the deployment that
 * one provider, never the push.
 */
describe("auth config with no auth env vars", () => {
  beforeEach(() => {
    resetAuthModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("a missing JWKS disables the sandbox provider instead of throwing", async () => {
    stubEnv("SANDBOX_JWT_JWKS", undefined);
    const { SANDBOX_JWT_JWKS_DATA_URI } = await import(
      "../convex/sandboxAuthConfig"
    );
    expect(SANDBOX_JWT_JWKS_DATA_URI).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  test("a present JWKS still becomes the data URI the CLI expects", async () => {
    stubEnv("SANDBOX_JWT_JWKS", '{"keys":[]}');
    const { SANDBOX_JWT_JWKS_DATA_URI } = await import(
      "../convex/sandboxAuthConfig"
    );
    expect(SANDBOX_JWT_JWKS_DATA_URI).toBe(
      `data:application/json;base64,${btoa('{"keys":[]}')}`,
    );
  });

  test("an unseeded deployment configures no providers at all", async () => {
    stubEnv("SANDBOX_JWT_JWKS", undefined);
    stubEnv("CLERK_JWT_ISSUER_DOMAIN", undefined);
    const { default: config } = await import("../convex/auth.config");
    expect(config.providers).toEqual([]);
  });

  test("a provider is omitted rather than half-configured", async () => {
    // The CLI rejects a provider whose domain or jwks is undefined, which fails
    // the push just as hard as a throw would.
    stubEnv("SANDBOX_JWT_JWKS", undefined);
    stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://clerk.eva.dev");
    const { default: config } = await import("../convex/auth.config");
    expect(config.providers).toHaveLength(1);
    for (const provider of config.providers) {
      for (const [field, value] of Object.entries(provider)) {
        expect(typeof value, `${field} is not a usable value`).toBe("string");
      }
    }
  });

  test("a fully seeded deployment configures both providers", async () => {
    stubEnv("SANDBOX_JWT_JWKS", '{"keys":[]}');
    stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://clerk.eva.dev");
    const { default: config } = await import("../convex/auth.config");
    expect(config.providers).toHaveLength(2);
    const clerk = config.providers.find((provider) => "domain" in provider);
    expect(clerk).toBeDefined();
    for (const provider of config.providers) {
      for (const [field, value] of Object.entries(provider)) {
        expect(typeof value, `${field} is not a usable value`).toBe("string");
      }
    }
  });
});
