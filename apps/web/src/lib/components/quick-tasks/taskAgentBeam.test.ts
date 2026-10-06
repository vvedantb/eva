import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, "..");

const cardSource = readFileSource(join(here, "QuickTaskCard.tsx"));
const activitySource = readFileSource(
  join(here, "../tasks/taskAgentActivity.ts"),
);

function readFileSource(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

/** Every .tsx under lib/components — the card is rendered from several surfaces. */
function componentFiles(): string[] {
  return readdirSync(componentsDir, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((path) => path.endsWith(".tsx"));
}

/**
 * A chat turn used to promote the task's kanban status so the card would show
 * life while eva worked, which moved cards between columns behind the user's
 * back. That was reverted for a presentation-only signal: `status` keeps owning
 * the column and badge (fix 948c867c, replacing 52081d8e).
 *
 * The signal has since split in two. The beam rode on the live workflow ids as
 * well, so a card kept beaming after eva had stopped replying and the beam
 * stopped telling the reader anything. The beam is now the `in_progress` column
 * and nothing else; a live turn shows the pixel grid the session rows use.
 */
describe("a working agent marks the card without moving it", () => {
  it("agent activity is read from either live workflow", () => {
    const startAt = activitySource.indexOf("export function isTaskAgentActive");
    expect(startAt, "isTaskAgentActive moved or was renamed").toBeGreaterThan(
      -1,
    );
    // A chat turn and a main run are separate ids; either one means live.
    expect(activitySource).toContain("task.activeChatWorkflowId !== undefined");
    expect(activitySource).toContain("task.activeWorkflowId !== undefined");
    expect(
      activitySource,
      "one missing id is one surface that stops marking",
    ).toContain("||");
  });

  it("the beam is the in-progress column, not the live workflow", () => {
    const derivation = cardSource.match(/const isInProgress =\s*([^;]+);/);
    expect(derivation, "the beam derivation moved").not.toBeNull();
    const expression = derivation?.[1] ?? "";
    expect(expression).toContain('status === "in_progress"');
    expect(
      expression,
      "a live turn gets the pixel grid, not the beam",
    ).not.toContain("isAgentActive");
    expect(expression, "an errored card shows its error, not a beam").toContain(
      "!hasError",
    );
  });

  it("a live turn outside the in-progress column shows the pixel grid", () => {
    const derivation = cardSource.match(/const showAgentPulse =\s*([^;]+);/);
    expect(derivation, "the pixel-grid derivation moved").not.toBeNull();
    const expression = derivation?.[1] ?? "";
    expect(expression).toContain("isAgentActive");
    expect(expression, "the beam already covers in-progress").toContain(
      "!isInProgress",
    );
    expect(cardSource, "the grid is the session rows' Drive loader").toContain(
      "<LoadingState",
    );
    expect(cardSource).toContain("showAgentPulse ? (");
  });

  /**
   * The grid and the sandbox dot were two independent siblings, so a live turn
   * on an awake sandbox drew both — one mark saying "working" beside one saying
   * "awake", for a single fact. The grid wins, exactly as it does on the
   * session rows and the sandbox surface tabs.
   */
  it("the grid replaces the sandbox dot rather than joining it", () => {
    expect(
      cardSource,
      "the dot must be the else branch of the grid, not a sibling",
    ).toContain(") : sandboxStatus ? (");
    expect(
      cardSource,
      "a standalone dot branch renders both marks at once again",
    ).not.toContain("{sandboxStatus ? (");
  });

  it("the beam and the grid are the only things these drive", () => {
    expect(cardSource.indexOf("<BorderBeam"), "the beam moved").toBeGreaterThan(
      -1,
    );
    expect(cardSource).toContain("const wrappedCard = isInProgress ? (");
    // Column and badge presentation stay keyed off the persisted status.
    expect(cardSource).toContain("const statusMeta = statusConfig[status];");
    expect(
      cardSource.match(/statusConfig\[[^\]]*isAgentActive[^\]]*\]/),
      "status presentation must not be derived from agent activity",
    ).toBeNull();
  });

  /**
   * The part that actually rots: the flag is threaded in per render site, so a
   * new surface — or one that drops the prop in a refactor — silently goes back
   * to showing a task as idle while eva works on it.
   */
  it("every surface that renders the card passes the flag", () => {
    const wired: string[] = [];
    const bare: string[] = [];
    for (const path of componentFiles()) {
      const source = readFileSource(join(componentsDir, path));
      let at = source.indexOf("<QuickTaskCard");
      while (at > -1) {
        const props = source.slice(at, source.indexOf("/>", at));
        if (props.includes("isAgentActive={isTaskAgentActive(")) wired.push(path);
        else bare.push(`${path}:${at}`);
        at = source.indexOf("<QuickTaskCard", at + 1);
      }
    }
    // A scan that found nothing would satisfy the assertion below for free.
    expect(
      wired.length + bare.length,
      "the card moved or was renamed",
    ).toBeGreaterThan(3);
    expect(bare, "pass isAgentActive so the card marks while eva works").toEqual(
      [],
    );
  });
});
