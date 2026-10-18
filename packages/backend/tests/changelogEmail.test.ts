import { describe, it, expect } from "vitest";
import {
  changelogDisplayMarkdown,
  changelogStatsLine,
  parseChangelog,
} from "../convex/_changelog/entry";
import { buildChangelogEmailHtml } from "../convex/emailTemplates";

const structured = {
  items: [
    { category: "fixes", title: "Stopped sandboxes stay stopped", summary: "A stopped sandbox no longer restarts." },
    { category: "new", title: "Sandbox status page", summary: "See every awake sandbox.", path: "/settings/sandboxes" },
    { category: "new", title: "Agent <memory>", summary: "Agents remember facts.", highlight: true },
  ],
};

describe("parseChangelog", () => {
  it("accepts raw and ```json-fenced JSON", () => {
    const json = JSON.stringify(structured);
    expect(parseChangelog(json)?.items).toHaveLength(3);
    expect(parseChangelog("```json\n" + json + "\n```")?.items).toHaveLength(3);
  });

  it("returns null for legacy markdown and invalid shapes, so readers fall back", () => {
    expect(parseChangelog("✨ New Features\n- Something")).toBeNull();
    expect(parseChangelog("No updates this week.")).toBeNull();
    expect(parseChangelog('{"items":[]}')).toBeNull();
    expect(parseChangelog('{"items":[{"category":"new","title":"x","summary":"y","path":"https://evil.example"}]}')).toBeNull();
  });
});

describe("changelog display", () => {
  it("passes legacy markdown through and converts structured runs", () => {
    expect(changelogDisplayMarkdown("- legacy")).toBe("- legacy");
    expect(changelogDisplayMarkdown(JSON.stringify(structured))).toBe(
      "✨ New Features\n- **Sandbox status page**: See every awake sandbox. [Try it](/settings/sandboxes)\n- **Agent <memory>**: Agents remember facts.\n\n🐛 Bug Fixes\n- **Stopped sandboxes stay stopped**: A stopped sandbox no longer restarts.",
    );
  });

  it("counts categories in display order with singular nouns", () => {
    const changelog = parseChangelog(JSON.stringify(structured));
    expect(changelog && changelogStatsLine(changelog)).toBe("2 new features · 1 fix");
  });
});

describe("buildChangelogEmailHtml", () => {
  const changelog = parseChangelog(JSON.stringify(structured));
  if (!changelog) throw new Error("fixture must parse");
  const html = buildChangelogEmailHtml({
    appUrl: "https://app.example.com/",
    changelog,
    publishedAt: Date.UTC(2026, 9, 19),
    heading: "Eva Weekly Changelog",
    voteUrl: (item, vote) => `https://site.example/vote?item=${item}&vote=${vote}`,
  });

  it("shows the highlighted item once, as the top pick", () => {
    expect(html).toContain("Top pick this week");
    expect(html.match(/Agent &lt;memory&gt;/g)).toHaveLength(1);
  });

  it("links Try it into the app and gives every item both vote links", () => {
    expect(html).toContain('href="https://app.example.com/settings/sandboxes"');
    for (const item of [0, 1, 2]) {
      expect(html).toContain(`item=${item}&amp;vote=up`);
      expect(html).toContain(`item=${item}&amp;vote=down`);
    }
  });
});
