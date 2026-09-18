import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, path), "utf8");

const sessions = "../../../routes/_repo/$owner/$repo/sessions/_components";
const descriptors = read(`${sessions}/sandboxTabDescriptors.ts`);
const tabBar = read(`${sessions}/SandboxTabBar.tsx`);
const cycle = read("./useCycleSandboxTabHotkey.ts");
const palette = read("./sandboxPaletteCommands.ts");
const simpleView = read("../../hooks/useSimpleView.ts");
const desktopPanel = read(
  "../../../routes/_repo/$owner/$repo/sessions/DesktopPanel.tsx",
);

/**
 * The sandbox rail is one list of tabs assembled in four places that nothing
 * links together: `buildSandboxTabDescriptors` renders it,
 * `getCyclableSandboxTabs` steps through it on Shift+Tab,
 * `buildSandboxPaletteCommands` jumps into it from ⌘K, and `SandboxTabBar`
 * decides which of them simple view is allowed to see. Both order lists carry a
 * comment telling the next reader to keep them in step, which is the tell that
 * they drift.
 *
 * They did drift when Editor and Computer were promoted out of the `+`
 * dropdown into first-class rail tabs (4b948b101): that one change had to touch
 * every one of the four. Read as source text rather than imported because these
 * modules pull `@tabler/icons-react` and `@eva/ui`, and only the tab ids matter.
 */

/** Tab ids the descriptor builder appends, in strip order. */
const descriptorOrder = [
  ...descriptors.matchAll(/descriptors\.push\(\{\s+value: "([\w-]+)"/g),
].map((match) => match[1]);

/** Tab ids the Shift+Tab cycle appends, in cycle order. */
const cycleOrder = [...cycle.matchAll(/\[\.\.\.\w+, "([\w-]+)"\]/g)].map(
  (match) => match[1],
);

const baseCycleOrder = quoted(
  /SANDBOX_TAB_BAR_ORDER: SandboxTab\[\] = \[([^\]]*)\]/.exec(cycle)?.[1],
);

const baseRailOrder = [...sliceBetween(tabBar, "const allTabs", "];").matchAll(
  /value: "([\w-]+)"/g,
)].map((match) => match[1]);

/** Tabs the ⌘K palette can switch to directly (base tabs go through a map). */
const paletteTabs = [
  ...palette.matchAll(/run: \(\) => onTabChange\("([\w-]+)"\)/g),
].map((match) => match[1]);

const simpleViewTabs = quoted(
  /SIMPLE_VIEW_SANDBOX_TABS = new Set\(\[([\s\S]*?)\]\)/.exec(simpleView)?.[1],
);

/** The `buildSandboxTabDescriptors({ … })` argument object in `SandboxTabBar`. */
const builderArgs = sliceBetween(
  tabBar,
  "buildSandboxTabDescriptors({",
  "\n  });",
);

// Guards the parsing itself: a rename or a reshaped literal would otherwise
// leave every assertion below passing over empty lists.
describe("the rail sources still parse", () => {
  test("each list was found and is non-empty", () => {
    expect(descriptorOrder).toContain("editor");
    expect(cycleOrder).toContain("computer");
    expect(baseCycleOrder).not.toHaveLength(0);
    expect(baseRailOrder).not.toHaveLength(0);
    expect(paletteTabs).not.toHaveLength(0);
    expect(simpleViewTabs).not.toHaveLength(0);
    expect(builderArgs).toContain("showEditorTab");
  });
});

describe("the rail, the cycle and the palette agree on the tab set", () => {
  // The regression this exists for: a tab added to the strip but not to the
  // cycle silently drops out of Shift+Tab, and the far worse inverse — a tab in
  // the cycle that the strip never renders — parks the panel on a blank pane
  // with no chip to click back out of.
  test("Shift+Tab steps through the strip in strip order", () => {
    expect(cycleOrder).toEqual(descriptorOrder);
  });

  test("the always-visible base tabs match too", () => {
    expect(baseCycleOrder).toEqual(baseRailOrder);
  });

  test("custom app tabs stay last in both", () => {
    expect(descriptors.indexOf("for (const tab of customTabs)")).toBeGreaterThan(
      descriptors.lastIndexOf(`value: "${descriptorOrder.at(-1)}"`),
    );
    expect(cycle).toContain("...customTabSlugs]");
  });

  // A palette entry for a tab the rail never builds is a dead command that
  // strands the panel; a rail tab with no command is unreachable from ⌘K.
  test("every conditional rail tab is reachable from the palette", () => {
    expect([...paletteTabs].sort()).toEqual([...descriptorOrder].sort());
  });
});

describe("simple view hides exactly the tabs it cannot resolve", () => {
  /** The expression gating this tab in `SandboxTabBar`, resolved one hop. */
  const railGate = (tab: string): string => {
    const prop = `show${tab[0].toUpperCase()}${tab.slice(1)}Tab`;
    const passed = new RegExp(`${prop}:\\s*([\\w.]+)`).exec(builderArgs);
    const binding = passed?.[1] ?? prop;
    return new RegExp(`const ${binding} =([\\s\\S]*?);`).exec(tabBar)?.[1] ?? "";
  };

  // `isSimpleViewHiddenSandboxTab` bounces anything outside its allowlist to
  // Preview. So a tab the rail still renders in simple view but the allowlist
  // does not know about is unselectable — the chip is there and clicking it
  // snaps straight back. Promoting Editor and Computer to always-present rail
  // tabs is precisely the change that could have left them in that state.
  test("a tab is gated on !simpleView iff simple view bounces it", () => {
    for (const tab of descriptorOrder) {
      expect(
        railGate(tab).includes("simpleView"),
        `${tab}: rail gate and the simple-view allowlist disagree`,
      ).toBe(!simpleViewTabs.includes(tab));
    }
  });

  test("the palette drops its non-tab commands in simple view", () => {
    // New Preview and the terminals have no simple-view home to open into.
    expect(palette).toContain("if (!simpleView) {");
  });
});

describe("the Browser pane beams while the agent browses", () => {
  test("the colorful composer beam wraps the desktop panel", () => {
    expect(desktopPanel).toContain("<BorderBeam");
    expect(desktopPanel).toContain('colorVariant="colorful"');
    expect(desktopPanel).toContain("beam-inset");
    expect(desktopPanel).toContain("beamPane");
  });

  test("the inset lock ring is not used on the Browser surface", () => {
    expect(desktopPanel).toContain("beamPane ? null");
    expect(desktopPanel).toContain("ring-[3px] ring-inset ring-primary/70");
  });
});

/** Double-quoted string literals inside a matched source fragment. */
function quoted(fragment: string | undefined): string[] {
  return [...(fragment ?? "").matchAll(/"([\w-]+)"/g)].map((match) => match[1]);
}

function sliceBetween(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  if (start === -1) return "";
  const end = source.indexOf(to, start);
  return source.slice(start, end === -1 ? undefined : end);
}
