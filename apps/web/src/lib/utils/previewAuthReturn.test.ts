import { describe, expect, it } from "vitest";
import { parseAllowedReturn } from "./previewAuthReturn";

describe("parseAllowedReturn", () => {
  it("accepts the sandbox's own preview host", () => {
    const parsed = parseAllowedReturn(
      "https://sandy-3000.vercel.run/app",
      "sandy",
      3000,
    );
    expect(parsed?.hostname).toBe("sandy-3000.vercel.run");
  });

  it("rejects another vercel.run host", () => {
    expect(
      parseAllowedReturn("https://attacker-3000.vercel.run/", "sandy", 3000),
    ).toBeNull();
  });

  it("rejects a host that only contains the sandbox id", () => {
    expect(
      parseAllowedReturn(
        "https://sandy-evil-3000.vercel.run/",
        "sandy",
        3000,
      ),
    ).toBeNull();
  });

  it("rejects http and userinfo", () => {
    expect(
      parseAllowedReturn("http://sandy-3000.vercel.run/", "sandy", 3000),
    ).toBeNull();
    expect(
      parseAllowedReturn(
        "https://evil@sandy-3000.vercel.run/",
        "sandy",
        3000,
      ),
    ).toBeNull();
  });
});
