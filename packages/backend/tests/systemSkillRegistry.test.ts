import { describe, expect, it } from "vitest";
import {
  SYSTEM_SKILLS,
  SYSTEM_SKILL_MARKER,
  SYSTEM_SKILL_NAMES,
  buildStubMarkdown,
  isSystemSkillName,
  listSystemSkills,
  type SystemSkillHydration,
} from "../convex/_systemSkills/registry";
import { parseSkillMarkdown } from "../convex/_repoSkills/skillMarkdown";

const hydration: SystemSkillHydration = {
  owner: "acme",
  name: "web",
  rootDirectory: "apps/site",
  devPort: 4321,
  devCommand: "pnpm run start",
  startupCommands: ["pnpm convex dev"],
  baseBranch: "staging",
};

describe("system skill registry", () => {
  it("keys the record by each definition's own name", () => {
    for (const name of SYSTEM_SKILL_NAMES) {
      expect(SYSTEM_SKILLS[name].name).toBe(name);
    }
    expect(listSystemSkills()).toHaveLength(SYSTEM_SKILL_NAMES.length);
  });

  it("recognises only registry names", () => {
    expect(isSystemSkillName("eva-capture")).toBe(true);
    expect(isSystemSkillName("eva-anything-else")).toBe(false);
  });

  it("keeps descriptions on a single frontmatter line", () => {
    for (const definition of listSystemSkills()) {
      expect(definition.description).not.toContain("\n");
      expect(definition.description.length).toBeGreaterThan(0);
    }
  });
});

describe("buildStubMarkdown", () => {
  it("round-trips through the repo skill parser", () => {
    for (const definition of listSystemSkills()) {
      const parsed = parseSkillMarkdown(
        buildStubMarkdown(definition),
        "fallback",
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.skill.title).toBe(definition.name);
      expect(parsed.skill.description).toBe(definition.description);
    }
  });

  it("carries the marker and points at get_skill", () => {
    const stub = buildStubMarkdown(SYSTEM_SKILLS["eva-capture"]);
    expect(stub).toContain(SYSTEM_SKILL_MARKER);
    expect(stub).toContain("get_skill");
    expect(stub).toContain('{"name": "eva-capture"}');
    // The stub must not stand in for the real instructions when MCP is down.
    expect(stub).toContain("Do not improvise a replacement");
  });
});

describe("eva-capture content", () => {
  const content = SYSTEM_SKILLS["eva-capture"].buildContent(hydration);

  it("hydrates the repo's dev server and app directory", () => {
    expect(content).toContain("acme/web");
    expect(content).toContain("http://localhost:4321");
    expect(content).toContain("pnpm run start");
    expect(content).toContain("/tmp/repo/apps/site");
    expect(content).toContain("pnpm convex dev");
  });

  it("sends deliverables to the folders Eva sweeps", () => {
    expect(content).toContain("/tmp/repo/recordings/");
    expect(content).toContain("/tmp/repo/screenshots/");
    expect(content).toContain("/tmp/checks/");
  });

  it("falls back to port 3000 and the default dev command", () => {
    const bare = SYSTEM_SKILLS["eva-capture"].buildContent({
      owner: "acme",
      name: "web",
      baseBranch: "main",
    });
    expect(bare).toContain("http://localhost:3000");
    expect(bare).toContain("pnpm run dev");
    expect(bare).not.toContain("App directory");
  });
});

describe("eva-ask content", () => {
  it("hydrates the repo and stays a chat-only tutor", () => {
    const content = SYSTEM_SKILLS["eva-ask"].buildContent(hydration);
    expect(content).toContain("acme/web");
    expect(content).toContain("/tmp/repo/apps/site");
    expect(content).toContain("Tutor, not a briefing");
    expect(content).toContain("mermaid");
    expect(content).toContain("Do not edit source files");
    expect(content).toContain("eva-plan");
  });

  it("tells the harness not to auto-trigger", () => {
    expect(SYSTEM_SKILLS["eva-ask"].description).toContain("never auto-trigger");
    expect(SYSTEM_SKILLS["eva-ask"].description).not.toContain("\n");
  });
});

describe("eva-audit content", () => {
  it("hydrates the base branch and renders the standard categories", () => {
    const content = SYSTEM_SKILLS["eva-audit"].buildContent(hydration);
    expect(content).toContain("origin/staging");
    expect(content).toContain("**Correctness**");
    expect(content).toContain("**Security**");
    expect(content).toContain("**Performance**");
    expect(content).toContain("**Code quality**");
  });

  it("reports markdown in chat rather than JSON", () => {
    const content = SYSTEM_SKILLS["eva-audit"].buildContent(hydration);
    expect(content).toContain("markdown, not JSON");
    expect(content).toContain("offering to fix the findings");
  });
});
