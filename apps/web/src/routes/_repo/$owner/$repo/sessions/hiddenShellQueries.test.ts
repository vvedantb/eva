import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function sourceOf(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8");
}

/**
 * A cached-hidden session used to keep streaming + message subscriptions
 * live, so a turn in the background re-rendered a whole chat tree the user
 * could not see. Skip those queries when `isRouteActive` is false; hold the
 * last paint so switching back does not flash.
 */
describe("hidden session shells skip hot queries", () => {
  it("SessionDetailClient skips messages and streaming when inactive", () => {
    const source = sourceOf("SessionDetailClient.tsx");
    expect(source).toContain("useHeldQuery");
    expect(source).toContain("isRouteActive ? { parentId: sessionId } : \"skip\"");
    expect(source).toContain("isRouteActive ? { entityId: sessionId } : \"skip\"");
  });

  it("useSessionSend skips turn status when inactive", () => {
    const source = sourceOf("_components/useSessionSend.ts");
    expect(source).toContain("isRouteActive ? { sessionId } : \"skip\"");
  });
});
