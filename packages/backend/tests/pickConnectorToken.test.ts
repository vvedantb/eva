import { describe, expect, it } from "vitest";
import { pickConnectorToken } from "../convex/_connectors/pick";
import { pickEnvToken } from "../convex/_connectors/providers";

describe("pickConnectorToken", () => {
  it("prefers OAuth over the team env key", () => {
    expect(pickConnectorToken("oauth-token", "env-key")).toEqual({
      token: "oauth-token",
      source: "oauth",
    });
  });

  it("falls back to the env key", () => {
    expect(pickConnectorToken(null, "env-key")).toEqual({
      token: "env-key",
      source: "env",
    });
  });

  it("returns null when neither is set", () => {
    expect(pickConnectorToken(null, null)).toBeNull();
  });
});

describe("pickEnvToken", () => {
  it("accepts LINEAR_TOKEN as an alias", () => {
    expect(pickEnvToken({ LINEAR_TOKEN: "lin" }, "linear")).toBe("lin");
  });

  it("prefers LINEAR_API_KEY", () => {
    expect(
      pickEnvToken(
        { LINEAR_API_KEY: "primary", LINEAR_TOKEN: "alias" },
        "linear",
      ),
    ).toBe("primary");
  });
});
