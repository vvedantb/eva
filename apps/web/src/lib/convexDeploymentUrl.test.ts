import { describe, expect, it } from "bun:test";
import { convexDeploymentUrl } from "./convexDeploymentUrl";

describe("convexDeploymentUrl", () => {
  /**
   * The sandbox writes its own backend's loopback address into the app env. A
   * browser outside the sandbox resolves that to itself, so the sync socket
   * closes with 1006 and the app never leaves its loading screen.
   */
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

  /** A path is already origin-relative, so it needs no rerouting. */
  it("resolves a path against the page origin", () => {
    expect(convexDeploymentUrl("/__convex", "https://eva-abc123.vercel.run")).toBe(
      "https://eva-abc123.vercel.run/__convex",
    );
  });

  /** Convex builds `${address}/api/…` by concatenation. */
  it("never returns a trailing slash", () => {
    expect(convexDeploymentUrl("https://eva.convex.cloud/", "https://eva.new")).toBe(
      "https://eva.convex.cloud",
    );
  });
});
