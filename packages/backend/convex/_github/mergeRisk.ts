import { stripBlock, upsertBlockAboveFooter } from "./prBodyBlocks";

/**
 * Fixed merge-risk rules over a pull request's changed files. No model: the
 * same diff always gets the same answer, and the agent that wrote the change
 * cannot argue its way to a lower score. Works for any repo Eva opens PRs in,
 * so the rules match common names (auth, billing, migrations), not eva paths.
 */

export const MERGE_RISK_START = "<!-- eva-merge-risk -->";
export const MERGE_RISK_END = "<!-- /eva-merge-risk -->";

export type RiskLevel = "low" | "medium" | "high";

export interface ChangedFile {
  filename: string;
  /** GitHub file status: added, removed, modified, renamed, … */
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff; GitHub omits it for binary and very large files. */
  patch?: string;
}

export interface RiskFinding {
  level: Exclude<RiskLevel, "low">;
  reason: string;
  paths: string[];
}

export interface MergeRisk {
  level: RiskLevel;
  findings: RiskFinding[];
}

interface PathRule {
  level: RiskFinding["level"];
  reason: string;
  test: (path: string) => boolean;
}

/** Matches a whole path segment or file-name word, case-insensitive. */
function segment(words: string): RegExp {
  return new RegExp(`(^|[/._-])(${words})([/._-]|$)`, "i");
}

const AUTH = segment(
  "auth|oauth|authn|authz|login|signin|sign-in|permissions?|rbac|acl|roles?|jwt|crypto|encryption|secrets?",
);
const BILLING = segment(
  "billing|payments?|stripe|invoices?|subscriptions?|checkout|pricing|credits?",
);
const MIGRATION = /(^|\/)(migrations?|migrate|alembic\/versions)\/|\.sql$/i;
const SCHEMA = /(^|\/)(schema\.(prisma|ts|js|sql|graphql|gql)|[^/]*\.prisma)$/i;
const DEPENDENCIES =
  /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|poetry\.lock|pyproject\.toml|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?)$/;
const DEPLOY =
  /(^|\/)(\.github\/workflows\/|Dockerfile|docker-compose[^/]*\.ya?ml$|vercel\.json$|netlify\.toml$|fly\.toml$|convex\.json$|[^/]*\.tf$|k8s\/|helm\/)/;
const ENV = /(^|\/)\.env[^/]*$|(^|\/)env\.(ts|js|mjs)$/;

const PATH_RULES: ReadonlyArray<PathRule> = [
  {
    level: "high",
    reason: "Database migration. It can be hard to undo once it runs.",
    test: (path) => MIGRATION.test(path),
  },
  {
    level: "high",
    reason: "Auth, permissions or secrets code.",
    test: (path) => AUTH.test(path),
  },
  {
    level: "high",
    reason: "Billing or payments code.",
    test: (path) => BILLING.test(path),
  },
  {
    level: "medium",
    reason: "Schema change. Check that existing data still fits.",
    test: (path) => SCHEMA.test(path),
  },
  {
    level: "medium",
    reason: "Dependency change.",
    test: (path) => DEPENDENCIES.test(path),
  },
  {
    level: "medium",
    reason: "CI, deploy or infrastructure config.",
    test: (path) => DEPLOY.test(path),
  },
  {
    level: "medium",
    reason: "Environment config. Deploys may need new variables.",
    test: (path) => ENV.test(path),
  },
];

/**
 * Added lines that drop an error: an empty catch block, a no-op `.catch`, a
 * bare `except: pass`. Single-line forms only; a multi-line empty block is
 * left to review rather than guessed at.
 */
const SWALLOWED_ERROR =
  /catch\s*(\([^)]*\))?\s*\{\s*\}|\.catch\(\s*\(\s*[\w\s,]*\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)|except(\s+[\w.]+(\s+as\s+\w+)?)?\s*:\s*pass\b/;

/** Over either size, a change is too big to review in one sitting. */
const LARGE_CHANGED_LINES = 800;
const LARGE_CHANGED_FILES = 40;

function addedLines(patch: string | undefined): string[] {
  if (patch === undefined) return [];
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

export function assessMergeRisk(files: ReadonlyArray<ChangedFile>): MergeRisk {
  const findings: RiskFinding[] = [];
  const add = (level: RiskFinding["level"], reason: string, paths: string[]) => {
    if (paths.length > 0) findings.push({ level, reason, paths });
  };

  for (const rule of PATH_RULES) {
    add(
      rule.level,
      rule.reason,
      files.filter((file) => rule.test(file.filename)).map((f) => f.filename),
    );
  }
  add(
    "medium",
    "Deletes files.",
    files.filter((file) => file.status === "removed").map((f) => f.filename),
  );
  add(
    "medium",
    "Adds code that swallows errors, so failures may go unseen.",
    files
      .filter((file) =>
        addedLines(file.patch).some((line) => SWALLOWED_ERROR.test(line)),
      )
      .map((f) => f.filename),
  );

  const changedLines = files.reduce(
    (sum, file) => sum + file.additions + file.deletions,
    0,
  );
  if (
    changedLines > LARGE_CHANGED_LINES ||
    files.length > LARGE_CHANGED_FILES
  ) {
    findings.push({
      level: "medium",
      reason: `Large change: ${changedLines} lines across ${files.length} files. Consider splitting it.`,
      paths: [],
    });
  }

  const level: RiskLevel = findings.some((f) => f.level === "high")
    ? "high"
    : findings.length > 0
      ? "medium"
      : "low";
  // High first, so the reviewer reads the worst finding first.
  findings.sort((a, b) =>
    a.level === b.level ? 0 : a.level === "high" ? -1 : 1,
  );
  return { level, findings };
}

/** Paths shown for one finding; the rest are counted. */
const MAX_PATHS_SHOWN = 3;

const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function formatMergeRisk(risk: MergeRisk): string {
  const heading = `### Merge risk: ${LEVEL_LABEL[risk.level]}`;
  if (risk.findings.length === 0) {
    return `${heading}\nNo risky paths or patterns found by Eva's fixed checks.`;
  }
  const lines = risk.findings.map((finding) => {
    const shown = finding.paths
      .slice(0, MAX_PATHS_SHOWN)
      .map((path) => `\`${path}\``);
    const more = finding.paths.length - shown.length;
    const where =
      shown.length === 0
        ? ""
        : ` ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
    return `- **${LEVEL_LABEL[finding.level]}:** ${finding.reason}${where}`;
  });
  return [heading, ...lines].join("\n");
}

/** Inserts or replaces the merge-risk block, above the Eva footer. */
export function insertMergeRisk(body: string, risk: MergeRisk): string {
  return upsertBlockAboveFooter(
    body,
    MERGE_RISK_START,
    MERGE_RISK_END,
    formatMergeRisk(risk),
  );
}

/** The body without the risk block, for handing back to a model as intent. */
export function stripMergeRisk(body: string): string {
  return stripBlock(body, MERGE_RISK_START, MERGE_RISK_END);
}
