import { describe, expect, it } from "vitest";
import {
  CHANGE_KIND_LABELS,
  CHANGE_KIND_QUESTION,
  changeDetail,
  clipReply,
  describeChange,
  humaniseSurface,
  isChangeKind,
  MAX_REPLY_CHARS,
  MENTION_QUESTION,
} from "../convex/_scopeCheck/describe";

describe("questions", () => {
  it("offers exactly the kinds the stored union allows", () => {
    expect(Object.keys(CHANGE_KIND_QUESTION.kind.criteria)).toEqual(
      Object.keys(CHANGE_KIND_LABELS),
    );
    expect(CHANGE_KIND_QUESTION.kind.type).toBe("choice");
  });

  it("asks the mention question as a boolean about the reply", () => {
    expect(MENTION_QUESTION.mentioned.type).toBe("boolean");
    expect(MENTION_QUESTION.mentioned.instructions).toContain("reply");
    expect(MENTION_QUESTION.mentioned.criteria.false).toContain("generic");
  });

  it("rejects an option Jev invented", () => {
    expect(isChangeKind("icon")).toBe(true);
    expect(isChangeKind("Icon")).toBe(false);
    expect(isChangeKind("vibes")).toBe(false);
  });
});

/**
 * The motivating case, hunk for hunk: a reviewer reading `IconAward →
 * IconTrophy` catches it, a reviewer reading `@@ -42,7 +42,9 @@` does not.
 */
describe("changeDetail", () => {
  it("names the icon that replaced another", () => {
    const body = [
      "-      <IconAward size={16} />",
      "+      <IconTrophy size={16} />",
    ].join("\n");
    expect(changeDetail("icon", body)).toBe("IconAward → IconTrophy");
  });

  it("names an icon that was only added", () => {
    expect(changeDetail("icon", "+  <IconTrophy />")).toBe("added IconTrophy");
  });

  it("names an icon that was only removed", () => {
    expect(changeDetail("icon", "-  <IconAward />")).toBe("removed IconAward");
  });

  it("reads Mantine shades, hexes, css vars and tailwind classes as colour", () => {
    expect(
      changeDetail("colour", '-  color="green.1"\n+  color="green.0"'),
    ).toBe("green.1 → green.0");
    expect(changeDetail("colour", "-  fill: #E0ECD4;\n+  fill: #336900;")).toBe(
      "#E0ECD4 → #336900",
    );
    expect(
      changeDetail(
        "colour",
        '-  className="bg-muted"\n+  className="bg-warning-bg"',
      ),
    ).toBe("bg-muted → bg-warning-bg");
  });

  it("quotes the wording that changed", () => {
    expect(
      changeDetail(
        "wording",
        '-  <Text>"Archive"</Text>\n+  <Text>"Archived"</Text>',
      ),
    ).toBe("Archive → Archived");
  });

  it("stays quiet when both sides share every value", () => {
    const body = "-  <IconAward size={16} />\n+  <IconAward size={20} />";
    expect(changeDetail("icon", body)).toBeUndefined();
  });

  it("stays quiet for kinds no single literal names", () => {
    expect(changeDetail("layout", "-  gap={2}\n+  gap={4}")).toBeUndefined();
    expect(changeDetail("behaviour", "+  navigate('/x')")).toBeUndefined();
  });

  it("ignores the diff's own file markers", () => {
    const body = "--- a/src/Icon.tsx\n+++ b/src/Icon.tsx\n+  <IconTrophy />";
    expect(changeDetail("icon", body)).toBe("added IconTrophy");
  });
});

describe("humaniseSurface", () => {
  it("turns a component file into a screen name", () => {
    expect(humaniseSurface("apps/web/src/components/AwardedPanel.tsx")).toBe(
      "Awarded panel",
    );
  });

  it("borrows the folder for a route file", () => {
    expect(
      humaniseSurface("app/domcare/[id]/care-package-opportunities/page.tsx"),
    ).toBe("Care package opportunities");
  });

  it("skips dynamic and grouping segments when borrowing", () => {
    expect(humaniseSurface("app/(dashboard)/[orgId]/index.tsx")).toBe(
      "Dashboard",
    );
  });

  it("splits kebab, snake and dotted names", () => {
    expect(humaniseSurface("src/care-package-card.tsx")).toBe(
      "Care package card",
    );
    expect(humaniseSurface("src/scope_check_chip.ts")).toBe("Scope check chip");
  });

  it("falls back to the file name when there are no words to make", () => {
    expect(humaniseSurface("src/[id].tsx")).toBe("[id].tsx");
  });
});

describe("describeChange", () => {
  it("leads with the category and carries the literal", () => {
    expect(
      describeChange({
        kind: "icon",
        file: "src/AwardedPanel.tsx",
        body: "-<IconAward />\n+<IconTrophy />",
      }),
    ).toBe("Icon changed (IconAward → IconTrophy)");
  });

  it("drops to the category alone when no literal is extractable", () => {
    expect(
      describeChange({
        kind: "layout",
        file: "src/AwardedPanel.tsx",
        body: "-  gap={2}\n+  gap={4}",
      }),
    ).toBe("Layout or spacing changed");
  });

  it("names the screen when Jev could not classify the hunk", () => {
    expect(
      describeChange({
        kind: undefined,
        file: "src/AwardedPanel.tsx",
        body: "+anything",
      }),
    ).toBe("Changed Awarded panel");
  });
});

describe("clipReply", () => {
  it("clips to the cap and leaves a short reply alone", () => {
    expect(clipReply("x".repeat(MAX_REPLY_CHARS + 100))).toHaveLength(
      MAX_REPLY_CHARS,
    );
    expect(clipReply("Swapped the icon.")).toBe("Swapped the icon.");
  });
});
