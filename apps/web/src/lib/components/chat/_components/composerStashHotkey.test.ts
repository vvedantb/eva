import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/** Comments there name the very API these assertions rule out. */
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "ComposerStash.tsx"),
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .replace(/\/\*\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const call = shortcutCall();

/**
 * ⌘S is the browser's save-file dialog, and the hotkey manager only reaches a
 * registration's callback — and so its `preventDefault` — while that
 * registration is enabled. Gating the registration on composer focus therefore
 * did not merely skip the stash: every ⌘S the focus heuristic missed fell
 * through to the browser and opened the save dialog over the app. The gate
 * belongs inside the callback, after the event is already swallowed.
 */
describe("the composer's stash hotkey always swallows the browser default", () => {
  test("the registration is never gated by enabled", () => {
    expect(call).toContain("requireReset");
    expect(call, "an enabled gate stops preventDefault running").not.toContain(
      "enabled",
    );
  });

  test("preventDefault runs before any early return", () => {
    const preventAt = call.indexOf("event.preventDefault();");
    expect(
      preventAt,
      "the callback stopped preventing the default",
    ).toBeGreaterThan(-1);
    // Every guard below it is an early return, so a guard that moved above it
    // hands ⌘S back to the browser on exactly the paths that gate the stash.
    expect(preventAt).toBeLessThan(call.indexOf("if ("));
    expect(preventAt).toBeLessThan(call.indexOf("return"));
  });

  test("acting on the stash still needs this composer's focus", () => {
    // Otherwise every mounted composer stashes on one keypress.
    expect(call).toContain(
      "if (!open && !rootRef.current?.contains(document.activeElement)) return;",
    );
  });

  /**
   * A sleeping sandbox disables sending, not stashing: the stash is repo-scoped
   * Convex state, and the trigger and drawer stay clickable while Eva sleeps.
   * Gating the callback on that flag turned ⌘S into a dead key — swallowed by
   * `preventDefault`, then dropped — on the very surface where a draft the user
   * cannot send yet is most worth stashing.
   */
  test("the send-disabled state does not gate the stash", () => {
    expect(call).not.toContain("disabled");
  });
});

/** The `useShortcut(…)` call, up to the `);` that closes it. */
function shortcutCall(): string {
  const startAt = source.indexOf('useShortcut(\n    "stashDraft"');
  expect(startAt, "the stashDraft registration moved").toBeGreaterThan(-1);
  const end = source.indexOf("\n  );", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}
