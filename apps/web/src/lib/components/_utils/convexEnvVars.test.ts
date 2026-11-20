import { expect, test } from "bun:test";
import { CONVEX_ENV_VARS } from "./convexEnvVars";

// Regression guard for the Convex URL leak (fix: "Keep Convex URL out of the
// sandbox + backfill migration"). The URL slot shipped with
// `sandboxExclude: false`, so every sandboxed app was handed the platform's own
// Convex deployment URL. `sandboxExclude` is stored per value at save time, so a
// single flag flip here silently re-enables the leak for all newly saved vars.

test("every Convex credential slot is excluded from the sandbox by default", () => {
  for (const entry of CONVEX_ENV_VARS) {
    expect(
      entry.sandboxExclude,
      `${entry.primaryKey} must set sandboxExclude: true so it never reaches the sandbox`,
    ).toBe(true);
  }
});

test("Convex deployment URLs are sandbox-excluded, not just the deploy keys", () => {
  // The keys were already excluded before the fix; the URL slots were the leak.
  const urlKeys = ["NEXT_PUBLIC_CONVEX_URL", "PROD_CONVEX_URL"];
  for (const key of urlKeys) {
    const slot = CONVEX_ENV_VARS.find((entry) => entry.primaryKey === key);
    expect(slot, `expected a Convex slot for ${key}`).toBeDefined();
    expect(slot?.sandboxExclude).toBe(true);
  }
});
