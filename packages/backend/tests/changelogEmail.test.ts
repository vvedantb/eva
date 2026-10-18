import { describe, it, expect } from "vitest";
import {
  changelogDisplayMarkdown,
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

});

describe("buildChangelogEmailHtml", () => {
  const changelog = parseChangelog(JSON.stringify(structured));
  if (!changelog) throw new Error("fixture must parse");
  const html = buildChangelogEmailHtml({
    appUrl: "https://app.example.com/",
    changelog,
    // Monday 19 Oct 2026, so the email covers 12–18 Oct (ISO week 42).
    publishedAt: Date.UTC(2026, 9, 19, 3),
    feedbackUrl: (f) =>
      `https://site.example/vote?vote=${f.vote}${"itemIndex" in f ? `&item=${f.itemIndex}` : ""}`,
  });

  it("labels the week the changelog covers", () => {
    expect(html).toContain("Week 42 · 12–18 Oct 2026");
  });

  it("shows the highlighted item once, as the top pick, outside the grid", () => {
    expect(html).toContain("Top pick this week");
    expect(html.match(/Agent &lt;memory&gt;/g)).toHaveLength(1);
    expect(html).toContain("Also new");
    expect(html).toContain("Faster, fixed and polished");
  });

  it("puts item votes on the top pick only, plus one whole-email rating", () => {
    expect(html.match(/vote=up/g)).toHaveLength(1);
    expect(html).toContain("vote=up&amp;item=2");
    for (const rating of ["love", "ok", "meh"]) {
      expect(html.match(new RegExp(`vote=${rating}"`, "g"))).toHaveLength(1);
    }
  });

  it("links Try it into the app", () => {
    expect(html).toContain('href="https://app.example.com/settings/sandboxes"');
  });
});
