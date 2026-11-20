import { describe, it, expect } from "bun:test";
import { parseSkillMarkdown } from "../convex/_repoSkills/skillMarkdown";

const carepulseDescription = `---
name: carepulse-data-tables
description:
  CarePulse data table conventions using mantine-datatable and nuqs for
  URL-based filter and sort state. Use when creating or editing list/table
  views in apps/web.
license: MIT
---

# Body
`;

const singleLineDescription = `---
name: vercel-react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering.
---

# Body
`;

const foldedDescription = `---
name: example-skill
description: >
  First line of a folded description that continues
  on the next line.
---

# Body
`;

describe("parseSkillMarkdown", () => {
  it("parses YAML-indented multiline description", () => {
    const result = parseSkillMarkdown(carepulseDescription, "fallback");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skill.title).toBe("carepulse-data-tables");
    expect(result.skill.description).toMatch(
      /CarePulse data table conventions/,
    );
  });

  it("parses single-line description", () => {
    const result = parseSkillMarkdown(singleLineDescription, "fallback");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skill.title).toBe("vercel-react-best-practices");
    expect(result.skill.description).toMatch(/React and Next\.js/);
  });

  it("parses folded description block", () => {
    const result = parseSkillMarkdown(foldedDescription, "fallback");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skill.title).toBe("example-skill");
    expect(result.skill.description).toMatch(/folded description/);
  });

  it("rejects missing frontmatter", () => {
    const result = parseSkillMarkdown("# No frontmatter", "fallback");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_frontmatter");
  });

  it("rejects empty description", () => {
    const result = parseSkillMarkdown(
      `---
name: empty-desc
description:
license: MIT
---
`,
      "fallback",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_description");
  });
});
