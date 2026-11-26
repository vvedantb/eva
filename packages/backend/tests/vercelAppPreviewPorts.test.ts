import { describe, expect, it } from "bun:test";
import {
  VERCEL_APP_INTERNAL_PORT,
  VERCEL_PREVIEW_PROXY_PORT,
  vercelAppListenPort,
  vercelForcedFrameworkDevCommand,
} from "../convex/_sandbox_runtime/vercelAppPorts";
import { workspaceDirShell } from "../convex/_sandbox_runtime/helpers";

describe("vercelAppListenPort", () => {
  it("moves listen off 3000 so the auth proxy can own the public slot", () => {
    expect(vercelAppListenPort(3000)).toBe(VERCEL_APP_INTERNAL_PORT);
    expect(VERCEL_PREVIEW_PROXY_PORT).toBe(3000);
  });

  it("keeps non-proxy logical ports as the listen port", () => {
    expect(vercelAppListenPort(3001)).toBe(3001);
    expect(vercelAppListenPort(5173)).toBe(5173);
  });

  it("remaps reserved public slots away from the proxy", () => {
    expect(vercelAppListenPort(54321)).toBe(VERCEL_APP_INTERNAL_PORT);
    expect(vercelAppListenPort(6080)).toBe(VERCEL_APP_INTERNAL_PORT);
    expect(vercelAppListenPort(8080)).toBe(VERCEL_APP_INTERNAL_PORT);
  });
});

describe("vercelForcedFrameworkDevCommand", () => {
  const root = workspaceDirShell();

  it("forces next onto the listen port via pnpm exec", () => {
    expect(
      vercelForcedFrameworkDevCommand("pnpm", "apps/web", 13000, "next"),
    ).toBe(
      `cd ${root}/apps/web && HOSTNAME=0.0.0.0 PORT=13000 pnpm exec next dev -H 0.0.0.0 -p 13000`,
    );
  });

  it("forces vite onto the listen port via pnpm exec", () => {
    expect(
      vercelForcedFrameworkDevCommand(
        "pnpm",
        "apps/eprocurement",
        3001,
        "vite",
      ),
    ).toBe(
      `cd ${root}/apps/eprocurement && HOSTNAME=0.0.0.0 PORT=3001 pnpm exec vite --host 0.0.0.0 --port 3001`,
    );
  });

  it("uses npx for npm", () => {
    expect(vercelForcedFrameworkDevCommand("npm", "", 3001, "next")).toBe(
      `cd ${root} && HOSTNAME=0.0.0.0 PORT=3001 npx --yes next dev -H 0.0.0.0 -p 3001`,
    );
  });

  it("returns null for unknown frameworks", () => {
    expect(
      vercelForcedFrameworkDevCommand("pnpm", "", 3000, "unknown"),
    ).toBeNull();
  });
});
