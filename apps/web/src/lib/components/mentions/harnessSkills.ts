import type { api, AIProvider } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";

/**
 * Built-in skills each CLI harness ships with, surfaced in the `/` picker so
 * users can invoke them like repo skills. The harness executes them natively —
 * the backend strips the chip token down to the literal `/name` (see
 * `convex/_mentions/skillToken.ts`), so nothing is materialized in
 * the sandbox and no content sync is needed.
 *
 * This static list is the FALLBACK. The live catalog is reported by every
 * Claude sandbox at session start (`harnessSkills.upsertForProvider`, filtered
 * by `convex/_harnessSkills/filter.ts`) and read back by `useSkillSlashItems`;
 * these entries only show until the first report lands, and while that query
 * is still loading, so the picker never renders empty.
 *
 * Curated from the Agent SDK init handshake (`initializationResult().commands`)
 * of the Claude Code build the sandboxes ran at the time (2.1.239):
 * agent-invocable prompt skills only. Local/terminal-UI commands (`/clear`,
 * `/config`, `/usage`, …) and ones that fight Eva's own orchestration
 * (`/batch`) are left out — the same exclusions the ingest filter applies.
 * Descriptions are the harness's own, trimmed for the picker row.
 */
type HarnessCatalog = NonNullable<
  FunctionReturnType<typeof api.harnessSkills.getForProvider>
>;
export type HarnessSkill = HarnessCatalog["skills"][number];

type HarnessProviderMetadata = { badge: string };

const HARNESS_PROVIDER_METADATA: Partial<
  Record<AIProvider, HarnessProviderMetadata>
> = {
  claude: { badge: "Claude" },
};

export function harnessProviderMetadata(
  provider: AIProvider | undefined,
): HarnessProviderMetadata | undefined {
  return provider === undefined
    ? undefined
    : HARNESS_PROVIDER_METADATA[provider];
}

export function harnessCatalogProvider(
  provider: AIProvider | undefined,
): AIProvider | undefined {
  return harnessProviderMetadata(provider) ? provider : undefined;
}

export const CLAUDE_HARNESS_SKILLS: readonly HarnessSkill[] = [
  {
    name: "loop",
    description:
      "Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)",
  },
  {
    name: "goal",
    description: "Set a goal Claude checks before stopping",
  },
  {
    name: "compact",
    description: "Free up context by summarizing the conversation so far",
  },
  {
    name: "deep-research",
    description:
      "Deep research harness — fan-out web searches, fetch sources, adversarially verify claims, synthesize a cited report",
  },
  {
    name: "verify",
    description:
      "Verify that a code change actually does what it's supposed to by exercising it end-to-end and observing behavior",
  },
  {
    name: "code-review",
    description:
      "Review the current diff for correctness bugs and reuse/simplification/efficiency cleanups",
  },
  {
    name: "review",
    description:
      "Review a GitHub pull request; for your working diff use /code-review",
  },
  {
    name: "simplify",
    description:
      "Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes",
  },
  {
    name: "security-review",
    description:
      "Complete a security review of the pending changes on the current branch",
  },
  {
    name: "init",
    description: "Initialize a new CLAUDE.md file with codebase documentation",
  },
  {
    name: "run",
    description:
      "Launch and drive this project's app to see a change working in the real app, not just tests",
  },
  {
    name: "dataviz",
    description:
      "Create charts, graphs, plots, and dashboards that read as one system — elegant, accessible, consistent in light and dark",
  },
  {
    name: "claude-api",
    description:
      "Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, tool use, MCP, agents, caching",
  },
];

/**
 * Built-in skills for the harness a provider runs, if we know its catalog.
 *
 * `reported` is the live catalog from `harnessSkills.getForProvider`: a row's
 * skills, `null` when no sandbox has reported yet, `undefined` while the query
 * is in flight. Both fall back to the static list, so the picker never blinks.
 */
export function harnessSkillsForProvider(
  provider: AIProvider | undefined,
  reported?: readonly HarnessSkill[] | null,
): readonly HarnessSkill[] {
  if (!harnessProviderMetadata(provider)) return [];
  return reported && reported.length > 0 ? reported : CLAUDE_HARNESS_SKILLS;
}
