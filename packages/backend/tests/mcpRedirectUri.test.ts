import { describe, it, expect } from "vitest";
import {
  isAllowedOAuthRedirectUri,
  redirectUriMatchesRegistered,
} from "../convex/_mcp/redirectUri";

describe("isAllowedOAuthRedirectUri", () => {
  it("allows https and loopback http", () => {
    expect(isAllowedOAuthRedirectUri("https://client.example/cb")).toBe(
      true,
    );
    expect(isAllowedOAuthRedirectUri("http://127.0.0.1:3847/callback")).toBe(
      true,
    );
  });

  it("allows loopback http on any port for every loopback host", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
      for (const port of ["", ":1", ":8080", ":53682", ":65535"]) {
        expect(
          isAllowedOAuthRedirectUri(`http://${host}${port}/callback`),
        ).toBe(true);
      }
    }
  });

  it("rejects http hosts that only look like loopback", () => {
    expect(isAllowedOAuthRedirectUri("http://127.0.0.1.evil.com/cb")).toBe(
      false,
    );
    expect(isAllowedOAuthRedirectUri("http://localhost.evil.com/cb")).toBe(
      false,
    );
    expect(isAllowedOAuthRedirectUri("http://127.0.0.2/cb")).toBe(false);
  });

  it("allows native MCP client schemes", () => {
    expect(
      isAllowedOAuthRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"),
    ).toBe(true);
  });

  it("rejects unsafe schemes, non-loopback http, and invalid URIs", () => {
    expect(isAllowedOAuthRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedOAuthRedirectUri("file:///tmp/token")).toBe(false);
    expect(isAllowedOAuthRedirectUri("http://attacker.example/cb")).toBe(false);
    expect(isAllowedOAuthRedirectUri("not a url")).toBe(false);
  });
});

describe("redirectUriMatchesRegistered", () => {
  it("rejects redirects when nothing was registered", () => {
    expect(
      redirectUriMatchesRegistered(
        "cursor://anysphere.cursor-mcp/oauth/callback",
        [],
      ),
    ).toBe(false);
  });

  it("matches cursor scheme when registered", () => {
    expect(
      redirectUriMatchesRegistered(
        "cursor://anysphere.cursor-mcp/oauth/callback",
        ["cursor://anysphere.cursor-mcp/oauth/callback"],
      ),
    ).toBe(true);
  });

  it("rejects cursor callback when only loopback http was stored", () => {
    expect(
      redirectUriMatchesRegistered(
        "cursor://anysphere.cursor-mcp/oauth/callback",
        ["http://127.0.0.1:8765/callback"],
      ),
    ).toBe(false);
  });
});
