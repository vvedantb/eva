import { describe, expect, it } from "vitest";
import {
  buildScopeSection,
  MAX_SECTION_ROWS,
  orderRows,
  SCOPE_SECTION_END,
  SCOPE_SECTION_START,
  upsertScopeSection,
  type ScopeSectionRow,
} from "../convex/_github/prScopeSection";
import {
  insertPrDescription,
  PR_DESCRIPTION_START,
} from "../convex/_github/prDescriptionPrompt";

function row(overrides: Partial<ScopeSectionRow> = {}): ScopeSectionRow {
  return {
    summary: "Icon changed (IconAward → IconTrophy)",
    surface: "Awarded panel",
    file: "apps/web/src/AwardedPanel.tsx",
    unreported: false,
    ...overrides,
  };
}

const BODY =
  "## Task\nAdd tabs\n\n---\n[View in Eva](https://eva) | *Created by Eva*";

describe("buildScopeSection", () => {
  it("says nothing when nothing was flagged", () => {
    expect(buildScopeSection([])).toBe("");
  });

  it("leads on the unreported count when there is one", () => {
    const section = buildScopeSection([
      row({ unreported: true }),
      row({
        file: "b.tsx",
        surface: "Opportunity card",
      }),
    ]);
    expect(section).toContain("**1 change** was");
    expect(section).toContain("without being mentioned in the reply");
    expect(section).toContain("not mentioned in the reply");
  });

  it("softens when every flagged change was reported", () => {
    const section = buildScopeSection([row(), row({ file: "b.tsx" })]);
    expect(section).toContain("**2 changes** were");
    expect(section).toContain("The agent did report");
    expect(section).not.toContain("not mentioned in the reply");
  });

  it("names the change and the screen before the path", () => {
    const line = buildScopeSection([row()])
      .split("\n")
      .find((text) => text.startsWith("- "));
    expect(line).toBe(
      "- Icon changed (IconAward → IconTrophy) — Awarded panel (`apps/web/src/AwardedPanel.tsx`)",
    );
  });

  it("caps the list and says how many were left out", () => {
    const rows = Array.from({ length: MAX_SECTION_ROWS + 3 }, (_, index) =>
      row({ file: `file-${index}.tsx`, surface: `Screen ${index}` }),
    );
    const lines = buildScopeSection(rows)
      .split("\n")
      .filter((text) => text.startsWith("- "));
    expect(lines).toHaveLength(MAX_SECTION_ROWS + 1);
    expect(lines.at(-1)).toBe("- …and 3 more, listed in the Eva chat.");
  });
});

describe("orderRows", () => {
  it("puts unreported changes first", () => {
    const reported = row({ surface: "A screen" });
    const silent = row({ surface: "Z screen", unreported: true });
    expect(orderRows([reported, silent]).map((entry) => entry.surface)).toEqual(
      ["Z screen", "A screen"],
    );
  });
});

describe("upsertScopeSection", () => {
  it("writes the block above the Eva footer", () => {
    const next = upsertScopeSection(BODY, [row()]);
    expect(next.indexOf("## Task")).toBeLessThan(
      next.indexOf(SCOPE_SECTION_START),
    );
    expect(next.indexOf(SCOPE_SECTION_END)).toBeLessThan(
      next.indexOf("Created by Eva"),
    );
  });

  it("replaces its own block rather than stacking", () => {
    const once = upsertScopeSection(BODY, [row()]);
    const twice = upsertScopeSection(once, [row({ surface: "Other panel" })]);
    expect(twice.split(SCOPE_SECTION_START)).toHaveLength(2);
    expect(twice).toContain("Other panel");
    expect(twice).not.toContain("Awarded panel");
  });

  it("removes the block once nothing is flagged", () => {
    const once = upsertScopeSection(BODY, [row()]);
    expect(upsertScopeSection(once, [])).toBe(BODY);
  });

  it("leaves the generated description block untouched", () => {
    const described = insertPrDescription(BODY, "A reviewer summary");
    const next = upsertScopeSection(described, [row()]);
    expect(next).toContain(PR_DESCRIPTION_START);
    expect(next).toContain("A reviewer summary");
    expect(next).toContain(SCOPE_SECTION_START);
    // And the description rewrite leaves the scope block alone in turn.
    const rewritten = insertPrDescription(next, "A newer summary");
    expect(rewritten).toContain(SCOPE_SECTION_START);
    expect(rewritten).toContain("Awarded panel");
    expect(rewritten).not.toContain("A reviewer summary");
  });
});
