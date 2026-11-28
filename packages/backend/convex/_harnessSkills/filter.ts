import type { Infer } from "convex/values";
import type { harnessSkillValidator } from "../_validators/tableFields";

/** The schema validator is the single source for reported and stored skills. */
export type HarnessCatalogSkill = Infer<typeof harnessSkillValidator>;
export type ReportedHarnessCommand = HarnessCatalogSkill;

const DENIED_NAMES = new Set([
  "agents",
  "batch",
  "clear",
  "config",
  "context",
  "debug",
  "fewer-permission-prompts",
  "heapdump",
  "insights",
  "recap",
  "reload-skills",
  "run-skill-generator",
  "team-onboarding",
  "update-config",
  "usage",
]);

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,23}$/;

const MAX_DESCRIPTION_LENGTH = 200;

function normalizeDescription(description: string): string {
  const firstLine = description.split("\n")[0]?.trim() ?? "";
  return firstLine.length > MAX_DESCRIPTION_LENGTH
    ? firstLine.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd()
    : firstLine;
}

function isPickableName(name: string): boolean {
  if (name.startsWith("__")) return false;
  if (DENIED_NAMES.has(name)) return false;
  return NAME_PATTERN.test(name);
}

/** Filters, normalizes, dedupes by name and sorts a reported command list. */
export function filterHarnessCommands(
  commands: readonly ReportedHarnessCommand[],
): HarnessCatalogSkill[] {
  const byName = new Map<string, HarnessCatalogSkill>();
  for (const command of commands) {
    const name = command.name.trim();
    if (!isPickableName(name)) continue;
    if (byName.has(name)) continue;
    const hint = command.argumentHint?.trim();
    byName.set(name, {
      name,
      description: normalizeDescription(command.description),
      ...(hint ? { argumentHint: hint } : {}),
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * True when a report carries nothing new, so the mutation can skip the write.
 * Both lists come out of `filterHarnessCommands`, so order is already stable
 * and a positional compare is enough.
 */
export function isHarnessCatalogUnchanged(
  existing: { cliVersion: string; skills: readonly HarnessCatalogSkill[] },
  next: { cliVersion: string; skills: readonly HarnessCatalogSkill[] },
): boolean {
  if (existing.cliVersion !== next.cliVersion) return false;
  if (existing.skills.length !== next.skills.length) return false;
  return existing.skills.every((skill, index) => {
    const candidate = next.skills[index];
    return (
      candidate !== undefined &&
      skill.name === candidate.name &&
      skill.description === candidate.description &&
      skill.argumentHint === candidate.argumentHint
    );
  });
}
