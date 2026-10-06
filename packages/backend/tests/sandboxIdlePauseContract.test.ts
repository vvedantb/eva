import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Source contracts for the idle-pause feature. Each pins a wiring decision a
 * refactor could silently undo: the cron entry, the stop-reason divider in
 * every surface's close path, auto-wake gated on the visible sandbox pane in
 * every surface, and the MCP tool's dual URL shape.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function source(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

describe("idle pause wiring", () => {
  test("the sweep is registered every 5 minutes", () => {
    const crons = source("backend/convex/crons.ts");
    expect(crons).toMatch(
      /"sandbox idle pause sweep",\s*\{ minutes: 5 \},\s*internal\.sandboxIdlePause\.run/,
    );
  });

  test("every surface's close path renders the stop reason", () => {
    for (const file of [
      "backend/convex/_sessions/sandbox.ts",
      "backend/convex/_agentTasks/sandbox.ts",
      "backend/convex/_projects/sandbox.ts",
    ]) {
      const text = source(file);
      expect(text, file).toContain("stopAlertText(args.stopReason)");
      expect(text, file).not.toContain('content: "Sandbox stopped"');
      expect(text, file).toMatch(
        /export const recoverStuckStopping = internalMutation\(\{\s*args: \{[^}]*stopReason: stopReasonValidator/,
      );
    }
  });

  test("the daily auto-stop sweep is left alone", () => {
    const daily = source("backend/convex/sandboxAutoStop.ts");
    expect(daily).not.toContain("sandboxIdlePause");
    expect(daily).not.toContain("idlePolicy");
  });

  test("the sweep never execs into a sandbox (reads only, then the stop helpers)", () => {
    const sweep = source("backend/convex/sandboxIdlePause.ts");
    expect(sweep).not.toMatch(
      /getSandboxHandle|execHandle|withResume|resumeAfterStop|\.resume\(/,
    );
    expect(sweep).toContain("requestSessionSandboxStop(");
    expect(sweep).toContain("requestTaskSandboxStop(");
    expect(sweep).toContain("requestProjectSandboxStop(");
  });

  test("auto-wake mounts beside the presence beacon, not in prewarm effects", () => {
    const web = "../apps/web/src";
    const slots = source(`${web}/lib/components/sandbox/SandboxPaneSlots.tsx`);
    expect(slots).toContain("<SandboxAutoWake");
    expect(slots).toContain("autoWakeEligible");
    for (const file of [
      `${web}/routes/_repo/$owner/$repo/sessions/SandboxPanel.tsx`,
      `${web}/lib/components/tasks/TaskSandboxPanel.tsx`,
      `${web}/lib/components/projects/ProjectSandboxPanel.tsx`,
    ]) {
      expect(source(file), file).toContain("autoWakeEligible");
    }
    for (const file of [
      `${web}/routes/_repo/$owner/$repo/sessions/SessionDetailClient.tsx`,
      `${web}/lib/components/tasks/TaskDetailInline.tsx`,
      `${web}/routes/_repo/$owner/$repo/projects/ProjectDetailClient.tsx`,
    ]) {
      expect(source(file), file).not.toContain("autoWakeRef");
    }
  });

  test("get_preview_url always returns rawPreviewUrl beside previewUrl", () => {
    const tools = source("backend/convex/mcp/entityTools.ts");
    expect(tools).toContain("rawPreviewUrl");
    expect(tools).toContain("internal.sandboxIdlePause.getSettingsInternal");
  });

  test("the proxy heartbeat only counts external traffic", () => {
    const proxy = source("backend/convex/_sandbox_runtime/previewProxy.ts");
    expect(proxy).toContain(
      "if (!isLoopbackRequest(clientReq)) noteExternalActivity();",
    );
    expect(proxy).toContain("if (!isLoopbackRequest(req)) noteExternalActivity();");
  });
});
