import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const rawSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "TaskCardMenuItems.tsx"),
  "utf8",
).replaceAll("\r\n", "\n");

/** The comment on the fixed item names the very API asserted absent below. */
const source = rawSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * This menu is hosted by a task card in a list or on the kanban board, so
 * `window.location.pathname` is the list's own URL (`…/quick-tasks`) — copying
 * it dropped the task's numId and every card handed out the same link. The card
 * already passes its own path as `href`, which is what must be copied.
 */
describe("quick-task card copies the card's link, not the current page", () => {
  test("Copy task link reads the card's href", () => {
    expect(source).toContain("Copy task link");
    expect(source).toContain("window.location.origin + href");
    expect(source).not.toContain("window.location.pathname");
  });

  test("the copy item is gated on href, and Copy title stays unconditional", () => {
    // Everything between the two copy items: the gate belongs to this item,
    // not to the "Open in new tab" one further up the menu.
    const betweenCopyItems = source.slice(
      source.indexOf("Copy title"),
      source.indexOf("Copy task link"),
    );
    expect(betweenCopyItems).toContain("{href ? (");
    expect(source).toContain("Copy title");
  });
});
