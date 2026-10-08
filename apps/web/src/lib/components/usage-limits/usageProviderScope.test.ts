import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const webSrc = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readSource(path: string): string {
  return readFileSync(join(webSrc, path), "utf8").replaceAll("\r\n", "\n");
}

/**
 * One `UsageLimitsIndicator` everywhere. Call sites pass model + account; only
 * the chip bar changes. The popover always reads the same `getForViewer`
 * entries — every credential the viewer can run on, on every surface.
 */
describe("plan-usage is one shared indicator", () => {
  test("session, project, and task headers mount UsageLimitsIndicator with model + account", () => {
    const header = readSource(
      "routes/_repo/$owner/$repo/sessions/_components/SessionChatHeader.tsx",
    );
    const sandbox = readSource(
      "lib/components/sandbox/SandboxStartStopButton.tsx",
    );
    expect(header).toContain("<UsageLimitsIndicator");
    expect(header).toContain("model={model}");
    expect(header).toContain("providerAccountId={providerAccountId}");
    expect(sandbox).toContain("<UsageLimitsIndicator");
    expect(sandbox).toContain("model={model}");
    expect(sandbox).toContain("providerAccountId={providerAccountId}");
  });

  test("call sites do not pre-build UsageAccountScope", () => {
    const session = readSource(
      "routes/_repo/$owner/$repo/sessions/ChatPanel.tsx",
    );
    const project = readSource(
      "lib/components/projects/ProjectSandboxChatPanel.tsx",
    );
    const task = readSource("lib/components/tasks/TaskSandboxChatPanel.tsx");
    expect(session).not.toContain("claudeUsageAccountScope");
    expect(project).not.toContain("claudeUsageAccountScope");
    expect(task).not.toContain("claudeUsageAccountScope");
  });

  test("the indicator scopes the chip but always passes every account to the popover", () => {
    const indicator = readSource(
      "lib/components/usage-limits/UsageLimitsIndicator.tsx",
    );
    expect(indicator).toContain("chipSummaryForActive(chipRows, now, model)");
    expect(indicator).toContain(
      "<UsageLimitsDetails repoId={repoId} entries={entries} now={now} />",
    );
    expect(indicator).not.toContain("entries={chipRows}");
  });

  test("the popover refreshes every account from one button", () => {
    const details = readSource(
      "lib/components/usage-limits/UsageLimitsDetails.tsx",
    );
    const section = readSource(
      "lib/components/usage-limits/UsageProviderSection.tsx",
    );
    expect(details).toContain("<UsageRefreshButton repoId={repoId} />");
    // Per-row refresh is gone: the rows include accounts with no reading, and
    // refreshing them one at a time is a click per credential.
    expect(section).not.toContain("UsageRefreshButton");
  });
});
