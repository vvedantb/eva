/**
 * Materializes Eva system skills into the sandbox checkout.
 *
 * Each installed skill becomes `.agents/skills/<name>/SKILL.md`, a stub that
 * tells the agent to fetch the real instructions from the eva MCP server. The
 * files are never committed: a sentinel block in `.git/info/exclude` hides them
 * from `git add -A`.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { WORK_DIR } from "../config.js";
import { log, tryParseJson } from "../utils.js";

/** Written by `launch.ts` on every launch, empty list included. */
const SYSTEM_SKILLS_STATE_FILE = "/tmp/eva-system-skills.json";

/**
 * Marks a SKILL.md as Eva-materialized. A same-named skill without it is the
 * user's own and is never overwritten or pruned.
 * Duplicated from `convex/_systemSkills/registry.ts` — the callback bundle
 * cannot import Convex source. Drift only ever makes Eva more cautious.
 */
const SYSTEM_SKILL_MARKER = "<!-- eva:system-skill -->";

const EXCLUDE_BEGIN = "# >>> eva-system-skills >>>";
const EXCLUDE_END = "# <<< eva-system-skills <<<";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type SystemSkillStub = { name: string; stub: string };

/**
 * Parses the launch state file. Returns null when the payload is unreadable so
 * the caller leaves the checkout alone rather than pruning on bad input; an
 * empty array is a real instruction to remove every Eva stub.
 */
export function parseSystemSkillsFile(raw: string): SystemSkillStub[] | null {
  const parsed = tryParseJson(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const skills = parsed.skills;
  if (!Array.isArray(skills)) return null;

  const result: SystemSkillStub[] = [];
  for (const entry of skills) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const name = entry.name;
    const stub = entry.stub;
    if (typeof name !== "string" || typeof stub !== "string") continue;
    // Names become path segments — reject anything that could escape the dir.
    if (!SKILL_NAME_PATTERN.test(name)) continue;
    result.push({ name, stub });
  }
  return result;
}

/** Replaces (or removes) the Eva sentinel block in a `.git/info/exclude` body. */
export function renderExcludeContent(
  existing: string,
  names: string[],
): string {
  const lines = existing.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let insideBlock = false;
  for (const line of lines) {
    if (line.trim() === EXCLUDE_BEGIN) {
      insideBlock = true;
      continue;
    }
    if (line.trim() === EXCLUDE_END) {
      insideBlock = false;
      continue;
    }
    if (!insideBlock) kept.push(line);
  }

  while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") kept.pop();
  const preserved = kept.length > 0 ? `${kept.join("\n")}\n` : "";
  if (names.length === 0) return preserved;

  const block = [
    EXCLUDE_BEGIN,
    ...names.map((name) => `/.agents/skills/${name}/`),
    EXCLUDE_END,
    "",
  ].join("\n");
  return `${preserved}${block}`;
}

function skillsRoot(): string {
  return `${WORK_DIR}/.agents/skills`;
}

function isEvaStub(directoryName: string): boolean {
  const skillFile = `${skillsRoot()}/${directoryName}/SKILL.md`;
  if (!existsSync(skillFile)) return false;
  try {
    return readFileSync(skillFile, "utf8").includes(SYSTEM_SKILL_MARKER);
  } catch {
    return false;
  }
}

function writeStub(skill: SystemSkillStub): boolean {
  const directory = `${skillsRoot()}/${skill.name}`;
  if (existsSync(`${directory}/SKILL.md`) && !isEvaStub(skill.name)) {
    log(`[system-skills] ${skill.name} exists in the repo — leaving it alone`);
    return false;
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/SKILL.md`, skill.stub);
  return true;
}

function pruneStaleStubs(keep: Set<string>): void {
  const root = skillsRoot();
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (keep.has(entry.name)) continue;
    if (!isEvaStub(entry.name)) continue;
    try {
      rmSync(`${root}/${entry.name}`, { recursive: true, force: true });
      log(`[system-skills] pruned ${entry.name}`);
    } catch (err) {
      log(`[system-skills] prune failed for ${entry.name}: ${String(err)}`);
    }
  }
}

function updateGitExclude(names: string[]): void {
  const gitDir = `${WORK_DIR}/.git`;
  if (!existsSync(gitDir)) return;
  const infoDir = `${gitDir}/info`;
  const excludeFile = `${infoDir}/exclude`;
  const existing = existsSync(excludeFile)
    ? readFileSync(excludeFile, "utf8")
    : "";
  const next = renderExcludeContent(existing, names);
  if (next === existing) return;
  mkdirSync(infoDir, { recursive: true });
  writeFileSync(excludeFile, next);
}

/**
 * Reconciles the checkout against this launch's installed skills. Best-effort:
 * a failure here must never take down the turn.
 */
export function materializeSystemSkills(): void {
  try {
    if (!existsSync(SYSTEM_SKILLS_STATE_FILE)) return;
    if (!existsSync(WORK_DIR)) {
      log("[system-skills] no checkout yet — skipping");
      return;
    }

    const skills = parseSystemSkillsFile(
      readFileSync(SYSTEM_SKILLS_STATE_FILE, "utf8"),
    );
    if (skills === null) {
      log("[system-skills] state file unreadable — skipping");
      return;
    }

    const written: string[] = [];
    for (const skill of skills) {
      try {
        if (writeStub(skill)) written.push(skill.name);
      } catch (err) {
        log(`[system-skills] write failed for ${skill.name}: ${String(err)}`);
      }
    }

    pruneStaleStubs(new Set(written));
    updateGitExclude(written);
    log(
      `[system-skills] materialized ${written.length}/${skills.length}` +
        (written.length > 0 ? ` (${written.join(", ")})` : ""),
    );
  } catch (err) {
    log(`[system-skills] materialize failed: ${String(err)}`);
  }
}
