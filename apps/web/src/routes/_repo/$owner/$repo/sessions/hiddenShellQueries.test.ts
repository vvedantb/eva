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
    expect(source).toContain("isRouteActive ? { id: sessionId } : \"skip\"");
    // The transcript, queue and stream belong to the active chat tab.
    expect(source).toContain(
      "isRouteActive && chatId ? { parentId: chatId } : \"skip\"",
    );
    expect(source).toContain(
      "isRouteActive && chatId ? { entityId: chatId } : \"skip\"",
    );
    expect(source).toContain("if (!isRouteActive) return;");
    expect(source).toContain("void prewarmDaemon({ chatId })");
  });

  it("useChatSend skips turn status when inactive", () => {
    const source = sourceOf("_components/useChatSend.ts");
    expect(source).toContain("isRouteActive ? { entityId: chatId } : \"skip\"");
  });

  it("useChatModel holds sessionChats.get when the shell is inactive", () => {
    const source = sourceOf("../../../../../lib/hooks/useChatModel.ts");
    expect(source).toContain("useHeldQuery");
    expect(source).toContain("active ? { chatId } : \"skip\"");
  });

  it("annotation send and sandbox plans skip when the shell is inactive", () => {
    const annotation = sourceOf("_components/useSessionAnnotationSend.ts");
    expect(annotation).toContain("isRouteActive ? { parentId: chatId } : \"skip\"");
    expect(annotation).toContain("isRouteActive ? { entityId: chatId } : \"skip\"");

    const sandbox = sourceOf("SandboxPanel.tsx");
    expect(sandbox).toContain("useHeldQuery");
    expect(sandbox).toContain("isRouteActive ? { sessionId } : \"skip\"");
    expect(sandbox).toContain("useSessionAnnotationSend(\n    sessionId,\n    chatId,\n    isRouteActive,\n  )");

    const processes = sourceOf("_components/BackgroundProcessesPanel.tsx");
    expect(processes).toContain("isRouteActive ? { sessionId } : \"skip\"");
  });
});
