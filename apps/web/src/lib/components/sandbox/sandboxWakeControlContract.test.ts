import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const control = read("./SandboxStartStopButton.tsx");
const taskFooter = read("../tasks/_components/TaskFooter.tsx");
const taskDetail = read("../tasks/TaskDetailInline.tsx");
const projectDetail = read(
  "../../../routes/_repo/$owner/$repo/projects/ProjectDetailClient.tsx",
);

const headers: { name: string; source: string }[] = [
  { name: "TaskFooter", source: taskFooter },
  { name: "ProjectDetailClient", source: projectDetail },
];

/**
 * Regression (fix #807): the task and project headers carried a sleep-only
 * button, shown only while the sandbox was awake. Once the sandbox slept the
 * button vanished — and the chat header had already given up its own
 * start/stop pair, so there was no play button left anywhere and no way to
 * wake eva from the page.
 *
 * Both headers now render the one two-way control, gated so it stays visible
 * in the asleep state. A gate that drops `canStartSandbox`, or a header that
 * wires only `onStop`, puts the dead end straight back.
 */
describe("task and project headers can wake a sleeping sandbox", () => {
  test("the shared control drives both directions", () => {
    expect(control).toContain('onToggle(isActive ? "stop" : "start")');
    // Only stopping is unsafe mid-turn — a turn cannot run on a slept sandbox,
    // so a disagreement between the flags must never block a wake.
    expect(control).toContain(
      "const blockedMidTurn = isActive && isAssistantResponding",
    );
  });

  test.each(headers)("$name renders the control, not a sleep-only button", ({
    source,
  }) => {
    expect(source).toContain("SandboxStartStopButton");
    expect(source, "the sleep-only button was the bug").not.toContain(
      "SleepEvaButton",
    );
  });

  test.each(headers)("$name keeps the control visible while asleep", ({
    source,
  }) => {
    const gate =
      source.match(/const showSandboxToggle =\s*([^;]+);/)?.[1] ??
      source.match(/\{(isSandboxActive \|\| canStartSandbox)\s*\?/)?.[1] ??
      "";
    expect(gate, "the visibility gate moved or was renamed").not.toBe("");
    expect(gate).toContain("isSandboxActive");
    expect(
      gate,
      "dropping canStartSandbox hides the only play button once eva sleeps",
    ).toContain("canStartSandbox");
    // Held open through both transitions so the row does not jump; a
    // `!isSandboxStopping` term would pop it out again mid-sleep.
    expect(gate).not.toContain("isSandboxStopping");
  });

  test.each(headers)("$name wires start as well as stop", ({ source }) => {
    const handlerAt = source.indexOf("onToggle={(action) =>");
    expect(handlerAt, "the toggle handler moved").toBeGreaterThan(-1);
    const handler = source.slice(handlerAt, handlerAt + 240);
    expect(handler).toMatch(/if \(action === "start"\)/);
    expect(handler).toMatch(/Start[Ss]andbox\(\)/);
    expect(handler).toMatch(/Stop[Ss]andbox\(\)/);
  });

  test("the task page supplies the footer both callbacks and the starting flag", () => {
    // TaskFooter is presentational; the page owns the sandbox mutations, so a
    // missing prop here is the same dead end one level up.
    expect(taskDetail).toContain("onStartSandbox={");
    expect(taskDetail).toContain("onStopSandbox={");
    expect(
      taskDetail,
      "without it the control never shows its waking spinner",
    ).toContain("isSandboxStarting={");
  });
});

function read(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}
