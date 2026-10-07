/** Canonical tag vocabulary. The model may only pick from this list. */
export const TASK_TAGS = [
  "bug",
  "feature",
  "refactor",
  "docs",
  "testing",
  "chore",
  "migration",
  "performance",
  "security",
  "accessibility",
  "reliability",
  "design",
  "ux",
  "frontend",
  "backend",
  "database",
  "infra",
  "ci",
  "auth",
  "dependencies",
  "config",
  "integration",
] as const;

export type TaskTag = (typeof TASK_TAGS)[number];

/**
 * One rubric line per tag. These are the instructions the decision model is
 * asked against, so they have to read as a test a single task either passes
 * or fails — not as a category label.
 */
export const TASK_TAG_DESCRIPTIONS: Record<TaskTag, string> = {
  bug: "fixes incorrect behaviour, a crash or a regression",
  feature: "adds new user-facing capability",
  refactor: "restructures code without changing behaviour",
  docs: "writes or updates documentation, comments or guides",
  testing: "adds or changes automated tests or test tooling",
  chore: "routine upkeep with no user-visible effect",
  migration: "moves or reshapes existing data or schema",
  performance: "makes something measurably faster or cheaper",
  security: "closes a vulnerability or hardens access to data",
  accessibility:
    "improves use with a screen reader, keyboard or assistive tech",
  reliability: "reduces failures, flakiness or data loss in production",
  design: "changes visual design, layout or styling",
  ux: "changes how a flow behaves for the person using it",
  frontend: "web UI, components, styling, routing",
  backend: "server, Convex functions, business logic",
  database: "schema, indexes, queries or stored data",
  infra: "hosting, sandboxes, networking or deployment environments",
  ci: "build, lint, test or release pipelines",
  auth: "sign-in, sessions, permissions or access control",
  dependencies: "adds, removes or upgrades third-party packages",
  config: "settings, environment variables or feature flags",
  integration: "connects Eva to an external service or API",
};

/** Most tags one generation may add. Not a limit on a task's total tags. */
export const MAX_GENERATED_TAGS = 3;

/** How sure the model must be before a tag is applied without a human asking. */
export const TAG_PROBABILITY_THRESHOLD = 0.6;

/**
 * Picks the tags to apply from per-tag probabilities. Confident tags win over
 * many weak ones, so anything below the threshold is dropped before the cap
 * applies. Ties keep {@link TASK_TAGS} order, which makes the result stable
 * across runs that score two tags alike.
 */
export function selectTagsByProbability(
  probabilities: Partial<Record<TaskTag, number>>,
  alreadyApplied: readonly string[],
  threshold = TAG_PROBABILITY_THRESHOLD,
  max = MAX_GENERATED_TAGS,
): TaskTag[] {
  const applied = new Set(
    alreadyApplied.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
  );
  const scored: { tag: TaskTag; probability: number }[] = [];

  for (const tag of TASK_TAGS) {
    if (applied.has(tag)) continue;
    const probability = probabilities[tag];
    if (probability === undefined || probability < threshold) continue;
    scored.push({ tag, probability });
  }

  return scored
    .toSorted((a, b) => b.probability - a.probability)
    .slice(0, max)
    .map((entry) => entry.tag);
}

const TASK_TAG_BY_VALUE: ReadonlyMap<string, TaskTag> = new Map(
  TASK_TAGS.map((tag) => [tag, tag]),
);

/**
 * Turns the model's comma-separated reply into valid tags. Drops anything
 * off-vocabulary, anything the user already applied, and duplicates. Emits
 * canonical lowercase entries from {@link TASK_TAGS}.
 */
export function parseGeneratedTags(
  raw: string,
  alreadyApplied: readonly string[],
): TaskTag[] {
  const applied = new Set(
    alreadyApplied.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
  );
  const picked: TaskTag[] = [];
  const seen = new Set<string>();

  for (const part of raw.split(/[,\n]+/)) {
    if (picked.length >= MAX_GENERATED_TAGS) break;

    let token = part.trim().toLowerCase();
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")) ||
      (token.startsWith("`") && token.endsWith("`"))
    ) {
      token = token.slice(1, -1).trim().toLowerCase();
    }
    if (!token) continue;

    const tag = TASK_TAG_BY_VALUE.get(token);
    if (tag === undefined) continue;
    if (applied.has(tag) || seen.has(tag)) continue;

    seen.add(tag);
    picked.push(tag);
  }

  return picked;
}
