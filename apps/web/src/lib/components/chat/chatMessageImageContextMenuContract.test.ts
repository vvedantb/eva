import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// Regression guard for commit c1b0b2cea ("I cant right click on images and
// copy them in chat").
//
// Every chat bubble sits inside a Radix ContextMenu. Radix calls
// preventDefault on `contextmenu`, so a right-click on an image in a message
// opened "Copy message" instead of the browser's "Copy image / Save image as".
// The fix is a capture-phase handler on the trigger that stops propagation for
// <img> targets, so Radix never sees the event and the native menu opens.
// Two silent ways to break it: drop the handler in a refactor, or "tidy" it to
// preventDefault, which kills the native menu as well. Both still render and
// type-check, so pin them here.
//
// Disk-read contract check (matching the suite's other *Contract tests): the
// component pulls @eva/ui and Radix, and the node test env has no DOM.

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "ChatMessageContextMenu.tsx"), "utf8");

/** The opening <ContextMenuTrigger …> tag, props included. */
function triggerTag(): string {
  const start = source.indexOf("<ContextMenuTrigger");
  expect(start, "ChatMessageContextMenu no longer renders a trigger").toBeGreaterThan(-1);
  const end = source.indexOf("{children}", start);
  expect(end, "the trigger no longer wraps the message row").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("chat images keep the native context menu", () => {
  test("the trigger lets image right-clicks bypass Radix", () => {
    const tag = triggerTag();
    // Capture phase: Radix's bubble-phase handler on the same node must not run.
    expect(tag).toContain("onContextMenuCapture");
    expect(tag).toContain("instanceof HTMLImageElement");
    expect(tag).toContain("stopPropagation()");
  });

  test("the image bypass does not cancel the native menu", () => {
    expect(
      triggerTag(),
      "preventDefault on an image right-click hides the browser's Copy image menu",
    ).not.toContain("preventDefault");
  });
});
