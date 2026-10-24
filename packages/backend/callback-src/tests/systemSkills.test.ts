import { expect, test } from "vitest";
import {
  parseSystemSkillsFile,
  renderExcludeContent,
} from "../runtime/systemSkills.js";

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
