import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import type * as callbackConfig from "../config.js";
import {
  parseSystemSkillsFile,
  reconcileSystemSkills,
  renderExcludeContent,
} from "../runtime/systemSkills.js";

// A throwaway dir stands in for the sandbox checkout.
const workspace = vi.hoisted((): { dir: string } => ({ dir: "" }));

vi.mock("../config.js", async (importOriginal) => {
  const original = await importOriginal<typeof callbackConfig>();
  return {
    ...original,
    get WORK_DIR() {
      return workspace.dir;
    },
  };
});

const MARKER = "<!-- eva:system-skill -->";

function skillFile(root: string, name: string): string {
  return join(workspace.dir, root, name, "SKILL.md");
}

function writeSkill(root: string, name: string, body: string): void {
  mkdirSync(join(workspace.dir, root, name), { recursive: true });
  writeFileSync(skillFile(root, name), body);
}

beforeEach(() => {
  workspace.dir = mkdtempSync(join(tmpdir(), "system-skills-"));
});

test("parseSystemSkillsFile reads the launch payload", () => {
  const parsed = parseSystemSkillsFile(
    JSON.stringify({
      skills: [
        { name: "eva-capture", stub: "# capture" },
        { name: "eva-audit", stub: "# audit" },
      ],
    }),
  );
  expect(parsed).toEqual([
    { name: "eva-capture", stub: "# capture" },
    { name: "eva-audit", stub: "# audit" },
  ]);
});

test("parseSystemSkillsFile treats an empty list as a real instruction", () => {
  expect(parseSystemSkillsFile(JSON.stringify({ skills: [] }))).toEqual([]);
});

test("parseSystemSkillsFile returns null on unusable input", () => {
  // Null means "leave the checkout alone" — never prune on a bad payload.
  expect(parseSystemSkillsFile("not json")).toBeNull();
  expect(parseSystemSkillsFile("[]")).toBeNull();
  expect(parseSystemSkillsFile(JSON.stringify({ skills: "eva-capture" }))).toBeNull();
});

test("parseSystemSkillsFile drops entries that cannot be a directory name", () => {
  const parsed = parseSystemSkillsFile(
    JSON.stringify({
      skills: [
        { name: "../../etc", stub: "x" },
        { name: "Eva-Capture", stub: "x" },
        { name: "eva/capture", stub: "x" },
        { name: "eva-audit", stub: 42 },
        { name: "eva-capture", stub: "# capture" },
      ],
    }),
  );
  expect(parsed).toEqual([{ name: "eva-capture", stub: "# capture" }]);
});

test("renderExcludeContent adds a sentinel block to a fresh file", () => {
  expect(renderExcludeContent("", ["eva-capture"])).toBe(
    "# >>> eva-system-skills >>>\n/.agents/skills/eva-capture/\n/.claude/skills/eva-capture/\n# <<< eva-system-skills <<<\n",
  );
});

test("renderExcludeContent replaces its own block and keeps user lines", () => {
  const existing =
    "*.log\n\n# >>> eva-system-skills >>>\n/.agents/skills/eva-audit/\n# <<< eva-system-skills <<<\n";
  expect(renderExcludeContent(existing, ["eva-capture"])).toBe(
    "*.log\n# >>> eva-system-skills >>>\n/.agents/skills/eva-capture/\n/.claude/skills/eva-capture/\n# <<< eva-system-skills <<<\n",
  );
});

test("renderExcludeContent removes the block when nothing is installed", () => {
  const existing =
    "*.log\n# >>> eva-system-skills >>>\n/.agents/skills/eva-capture/\n# <<< eva-system-skills <<<\n";
  expect(renderExcludeContent(existing, [])).toBe("*.log\n");
  expect(renderExcludeContent("", [])).toBe("");
});

// Regression: stubs only went to `.agents/skills`, which Claude Code never reads.
test("reconcileSystemSkills writes each stub into both skill roots", () => {
  const stub = `${MARKER}\n# capture`;
  reconcileSystemSkills([{ name: "eva-capture", stub }]);
  expect(readFileSync(skillFile(".agents/skills", "eva-capture"), "utf8")).toBe(stub);
  expect(readFileSync(skillFile(".claude/skills", "eva-capture"), "utf8")).toBe(stub);
});

test("reconcileSystemSkills never shadows a user skill in either root", () => {
  writeSkill(".claude/skills", "eva-capture", "# my own capture");
  reconcileSystemSkills([{ name: "eva-capture", stub: `${MARKER}\n# capture` }]);
  expect(readFileSync(skillFile(".claude/skills", "eva-capture"), "utf8")).toBe(
    "# my own capture",
  );
  expect(existsSync(skillFile(".agents/skills", "eva-capture"))).toBe(false);
});

test("reconcileSystemSkills prunes stale Eva stubs from both roots only", () => {
  writeSkill(".agents/skills", "eva-audit", `${MARKER}\n# audit`);
  writeSkill(".claude/skills", "eva-audit", `${MARKER}\n# audit`);
  writeSkill(".claude/skills", "preflight", "# repo skill");
  reconcileSystemSkills([]);
  expect(existsSync(skillFile(".agents/skills", "eva-audit"))).toBe(false);
  expect(existsSync(skillFile(".claude/skills", "eva-audit"))).toBe(false);
  expect(readFileSync(skillFile(".claude/skills", "preflight"), "utf8")).toBe(
    "# repo skill",
  );
});
