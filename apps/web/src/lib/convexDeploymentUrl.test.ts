import { describe, expect, it } from "bun:test";
import { convexDeploymentUrl } from "./convexDeploymentUrl";

describe("convexDeploymentUrl", () => {
  it("routes a loopback backend through the preview proxy for a remote page", () => {
    expect(
      convexDeploymentUrl(
        "http://127.0.0.1:3210",
        "https://eva-abc123.vercel.run",
      ),
    ).toBe("https://eva-abc123.vercel.run/__convex");
  });

  it("keeps a loopback backend when the page is on loopback too", () => {
    expect(
      convexDeploymentUrl("http://127.0.0.1:3210", "http://localhost:3000"),
    ).toBe("http://127.0.0.1:3210");
    expect(
      convexDeploymentUrl("http://localhost:3210", "http://127.0.0.1:5173"),
    ).toBe("http://localhost:3210");
  });

  it("leaves a hosted deployment alone", () => {
    expect(
      convexDeploymentUrl(
        "https://good-mule-506.convex.cloud",
        "https://eva.new",
      ),
    ).toBe("https://good-mule-506.convex.cloud");
  });

  it("resolves a path against the page origin", () => {
    expect(convexDeploymentUrl("/__convex", "https://eva-abc123.vercel.run")).toBe(
      "https://eva-abc123.vercel.run/__convex",
    );
  });

  it("never returns a trailing slash", () => {
    expect(convexDeploymentUrl("https://eva.convex.cloud/", "https://eva.new")).toBe(
      "https://eva.convex.cloud",
    );
  });
});
