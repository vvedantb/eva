import type { AIProvider, Id } from "@eva/backend";
import { harnessSkillTokenId, systemSkillTokenId } from "./mentionText";

/**
 * The `@` mention and `/` skill pickers of a chat composer, as pure logic the
 * web editor (`MentionEditor`) and the phone composer share: the candidate
 * lists built from the same Convex queries, the trigger the draft is typing,
 * the filter, and the text an accepted pick leaves behind.
 */

/**
 * What a Data `@` entry points at. Mirrors the backend `DataMentionKind`
 * union — a new kind there fails to assign here until it is added.
 */
export type MentionKind = "document" | "session" | "project" | "quickTask";

export interface MentionItem<TId extends string = string> {
  id: TId;
  label: string;
  description?: string;
  /** Type badge shown in the picker (e.g. Eva, Claude, Person). */
  badge?: string;
  /** Provider badge identity, used to select its logo without matching text. */
  provider?: AIProvider;
  /** Data entity kind — the picker shows its icon in place of a kind badge. */
  kind?: MentionKind;
  /**
   * Set when this item is a teammate rather than a data entity, so the picker
   * row shows their avatar. Same value as `id` for people items; kept separate
   * so the renderer can tell the two kinds apart without re-deriving it.
   */
  personUserId?: Id<"users">;
}

export type SlashItem<TId extends string = string> = MentionItem<TId>;

/** The `@` or `/` the draft is typing, and the query after it. */
export interface MentionTrigger {
  kind: "mention" | "slash";
  query: string;
  startIndex: number;
}

/** Where the last accepted picker item put its chip, and what it inserted. */
export interface InsertedToken {
  startIndex: number;
  /** The visible token, e.g. `/caveman-help` or `@Design doc`. */
  token: string;
}

/**
 * A trigger starts the text or follows whitespace, and runs to the end of the
 * draft with no whitespace in it.
 */
function isValidTrigger(value: string, triggerIndex: number): boolean {
  if (/\s/.test(value.slice(triggerIndex + 1))) return false;
  const charBefore = triggerIndex > 0 ? value[triggerIndex - 1] : "";
  return triggerIndex === 0 || (charBefore !== undefined && /\s/.test(charBefore));
}

/** The last valid `@` or `/` trigger in `value`, or null. */
export function findMentionTrigger(value: string, hasMentions: boolean, hasSlash: boolean): MentionTrigger | null {
  const candidates: Array<{ kind: MentionTrigger["kind"]; index: number }> = [];
  if (hasMentions) {
    const atIndex = value.lastIndexOf("@");
    if (atIndex !== -1 && isValidTrigger(value, atIndex)) candidates.push({ kind: "mention", index: atIndex });
  }
  if (hasSlash) {
    const slashIndex = value.lastIndexOf("/");
    if (slashIndex !== -1 && isValidTrigger(value, slashIndex)) candidates.push({ kind: "slash", index: slashIndex });
  }
  if (candidates.length === 0) return null;
  const active = candidates.reduce((best, candidate) => (candidate.index >= best.index ? candidate : best));
  return { kind: active.kind, query: value.slice(active.index + 1), startIndex: active.index };
}

/**
 * True when the trigger just found is nothing but the chip the last accept
 * inserted, still intact.
 *
 * A chip's own text is indistinguishable from an in-progress trigger — `/label`
 * with no whitespace after it — so whenever the trailing space that accepting
 * inserts goes missing, the picker reopens filtering by the chip's own label.
 * The space can go missing for reasons outside this module: a surface that
 * overrides `white-space` to a collapsing value lets the browser's editing
 * engine drop it on the next keystroke.
 *
 * Gated on the token still being present at that index, so backspacing into a
 * chip (a deliberate way to re-open the picker and pick something else) still
 * works — the value stops matching, and the trigger is honoured again.
 */
export function isInsertedTokenTrigger(
  value: string,
  triggerStartIndex: number,
  inserted: InsertedToken | null,
): boolean {
  if (inserted === null) return false;
  if (triggerStartIndex !== inserted.startIndex) return false;
  return value.startsWith(inserted.token, inserted.startIndex);
}

/**
 * Substring match against the label or description. A query can never contain
 * whitespace — a space ends the `@`/`/` trigger — so one substring is enough.
 */
export function matchesMentionQuery(item: Pick<MentionItem, "label" | "description">, query: string): boolean {
  const needle = query.toLowerCase();
  if (needle.length === 0) return true;
  return `${item.label} ${item.description ?? ""}`.toLowerCase().includes(needle);
}

/**
 * The picker rows for a query: every match, alphabetical. Not capped — callers
 * need every doc/skill/person available, not an alphabetical first-N subset.
 */
export function filterMentionItems<TItem extends MentionItem>(
  items: readonly TItem[],
  query: string,
  matches: (item: TItem, query: string) => boolean = matchesMentionQuery,
): TItem[] {
  return items.filter((item) => matches(item, query)).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Whether the picker shows. Gated on the *unfiltered* list so a query that
 * matches nothing shows "No matches" instead of closing; the `/` picker also
 * shows with no skills at all when the surface has an empty state for it.
 */
export function shouldShowMentionPicker(
  trigger: MentionTrigger | null,
  counts: { mentions: number; skills: number; hasEmptySkills: boolean },
): boolean {
  if (trigger === null) return false;
  return trigger.kind === "slash" ? counts.skills > 0 || counts.hasEmptySkills : counts.mentions > 0;
}

/**
 * Accepting a picker row: the trigger and its query become the visible chip
 * (`@Label` / `/Label`) and a space. Returns the new draft and the chip, for
 * `isInsertedTokenTrigger`.
 */
export function acceptMentionTrigger(
  value: string,
  trigger: MentionTrigger,
  label: string,
): { value: string; inserted: InsertedToken } {
  const token = `${trigger.kind === "slash" ? "/" : "@"}${label}`;
  const before = value.slice(0, trigger.startIndex);
  const after = value.slice(trigger.startIndex + trigger.query.length + 1);
  return { value: `${before}${token} ${after}`, inserted: { startIndex: trigger.startIndex, token } };
}

/**
 * Teammates who can be `@`-mentioned (`teamMembers.listForRepo`). Nameless,
 * email-less accounts have nothing to show in the picker.
 */
export function peopleMentionItems(
  members: ReadonlyArray<{ _id: Id<"users">; fullName?: string; email?: string }>,
): MentionItem<Id<"users">>[] {
  return members.flatMap((member) => {
    const label = member.fullName?.trim() || member.email?.trim();
    if (!label) return [];
    return [{ id: member._id, label, badge: "Person", personUserId: member._id }];
  });
}

/** Data `@` candidates (`mentions.listData`): docs, sessions, projects, quick tasks. */
export function dataMentionItems(
  data: ReadonlyArray<{ id: string; label: string; badge: string; kind: MentionKind; description?: string }>,
): MentionItem[] {
  return data.map((item) => ({
    id: item.id,
    label: item.label,
    badge: item.badge,
    // Drives the picker's icon. Assigning the backend union here is the
    // guard: a new kind there fails to compile until it gets an icon.
    kind: item.kind,
    ...(item.description !== undefined ? { description: item.description } : {}),
  }));
}

/**
 * Merges teammate and data `@` mention candidates into one alphabetical picker
 * list, and returns the set of ids that belong to people.
 *
 * Callers need that set because people and data tokens are byte-identical
 * (`@[Label](convexId)`), so on the client the id is the only way to tell them
 * apart — a chip click should navigate for data but do nothing for a person,
 * and each kind gets a different hover card.
 */
export function mergeMentionItems(
  peopleItems: MentionItem<Id<"users">>[],
  dataItems: MentionItem[],
): { items: MentionItem[]; peopleIds: ReadonlySet<string> } {
  const items: MentionItem[] = [...peopleItems, ...dataItems].sort((a, b) => a.label.localeCompare(b.label));
  return { items, peopleIds: new Set(peopleItems.map((person) => person.id)) };
}

/** One built-in skill a harness reports (`harnessSkills.getForProvider`). */
export interface HarnessSkill {
  name: string;
  description: string;
  argumentHint?: string;
}

const HARNESS_PROVIDER_METADATA: Partial<Record<AIProvider, { badge: string }>> = {
  claude: { badge: "Claude" },
};

function harnessProviderMetadata(provider: AIProvider | undefined): { badge: string } | undefined {
  return provider === undefined ? undefined : HARNESS_PROVIDER_METADATA[provider];
}

/** The provider whose harness catalog to load, if its catalog is known. */
export function harnessCatalogProvider(provider: AIProvider | undefined): AIProvider | undefined {
  return harnessProviderMetadata(provider) ? provider : undefined;
}

/**
 * Built-in skills each CLI harness ships with, surfaced in the `/` picker so
 * users can invoke them like repo skills. The harness executes them natively —
 * the backend strips the chip token down to the literal `/name` (see
 * `convex/_mentions/skillToken.ts`), so nothing is materialized in
 * the sandbox and no content sync is needed.
 *
 * This static list is the FALLBACK. The live catalog is reported by every
 * Claude sandbox at session start (`harnessSkills.upsertForProvider`, filtered
 * by `convex/_harnessSkills/filter.ts`) and read back by the skill pickers;
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
export const CLAUDE_HARNESS_SKILLS: readonly HarnessSkill[] = [
  {
    name: "loop",
    description: "Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)",
  },
  { name: "goal", description: "Set a goal Claude checks before stopping" },
  { name: "compact", description: "Free up context by summarizing the conversation so far" },
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
    description: "Review the current diff for correctness bugs and reuse/simplification/efficiency cleanups",
  },
  { name: "review", description: "Review a GitHub pull request; for your working diff use /code-review" },
  {
    name: "simplify",
    description:
      "Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes",
  },
  { name: "security-review", description: "Complete a security review of the pending changes on the current branch" },
  { name: "init", description: "Initialize a new CLAUDE.md file with codebase documentation" },
  {
    name: "run",
    description: "Launch and drive this project's app to see a change working in the real app, not just tests",
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
function harnessSkillsForProvider(
  provider: AIProvider | undefined,
  reported?: readonly HarnessSkill[] | null,
): readonly HarnessSkill[] {
  if (!harnessProviderMetadata(provider)) return [];
  return reported && reported.length > 0 ? reported : CLAUDE_HARNESS_SKILLS;
}

/**
 * The harness's own built-in skills, shown last. A repo or system skill of
 * the same name shadows the built-in — same precedence the harness applies
 * when a project skill collides with a bundled one.
 */
export function harnessSlashItems(
  provider: AIProvider | undefined,
  existingItems: ReadonlyArray<Pick<SlashItem, "label">>,
  reported?: readonly HarnessSkill[] | null,
): SlashItem[] {
  const takenLabels = new Set(existingItems.map((item) => item.label));
  const metadata = harnessProviderMetadata(provider);
  if (!metadata) return [];
  return harnessSkillsForProvider(provider, reported).flatMap((skill) =>
    takenLabels.has(skill.name)
      ? []
      : [
          {
            id: harnessSkillTokenId(skill.name),
            label: skill.name,
            description: skill.description,
            // Same badge the `.claude/skills` repo skills carry — a built-in
            // and a Claude-only repo skill are both "provided by Claude" to
            // the person picking one.
            badge: metadata.badge,
            provider,
          },
        ],
  );
}

export function isClaudeSkillSourcePath(sourcePath: string | undefined): boolean {
  return sourcePath?.startsWith(".claude/skills/") === true;
}

interface RepoSkillCandidate {
  title: string;
  sourcePath?: string;
  available: boolean;
}

/** The repo skills a provider sees: Claude prefers its `.claude/skills` copy, others skip it. */
export function selectRepoSkillsForProvider<TSkill extends RepoSkillCandidate>(
  skills: ReadonlyArray<TSkill>,
  provider: AIProvider | undefined,
): TSkill[] {
  const available = skills.filter((skill) => skill.available);
  const genericTitles = new Set(
    available.filter((skill) => !isClaudeSkillSourcePath(skill.sourcePath)).map((skill) => skill.title),
  );
  const claudeTitles = new Set(
    available.filter((skill) => isClaudeSkillSourcePath(skill.sourcePath)).map((skill) => skill.title),
  );
  return available.filter((skill) => {
    const claudeOnly = isClaudeSkillSourcePath(skill.sourcePath);
    if (provider === "claude") return claudeOnly || !claudeTitles.has(skill.title);
    if (provider !== undefined) return !claudeOnly;
    return !claudeOnly || !genericTitles.has(skill.title);
  });
}

/**
 * The `/` skill list for a repo, from the three queries the pickers load:
 * skills synced from `.agents/skills` (`repoSkills.listByRepo`), the Eva system
 * skills installed on the repo (`repoSystemSkills.listForRepo`) and the
 * harness catalog (`harnessSkills.getForProvider`).
 *
 * The label is what the backend strips a chip down to, so a system skill must
 * be labelled with its raw registry name (`eva-capture`) — that is the name the
 * agent's skill directory carries in the sandbox.
 */
export function skillSlashItems(
  repoSkills: ReadonlyArray<RepoSkillCandidate & { _id: Id<"repoSkills">; description: string }>,
  systemSkills: ReadonlyArray<{ name: string; description: string; installed: boolean }>,
  provider: AIProvider | undefined,
  reported?: readonly HarnessSkill[] | null,
): SlashItem[] {
  const selectedRepoSkills = selectRepoSkillsForProvider(repoSkills, provider);
  const repoItems: SlashItem[] = selectedRepoSkills.map((skill) => ({
    id: skill._id,
    label: skill.title,
    description: skill.description,
    ...(isClaudeSkillSourcePath(skill.sourcePath) ? { badge: "Claude", provider: "claude" } : {}),
  }));
  // A repo skill of the same name shadows the Eva one — the sandbox
  // materializer leaves user-owned skill directories alone.
  const systemItems: SlashItem[] = systemSkills.flatMap((skill) =>
    skill.installed && !selectedRepoSkills.some((repo) => repo.title === skill.name)
      ? [{ id: systemSkillTokenId(skill.name), label: skill.name, description: skill.description, badge: "Eva" }]
      : [],
  );
  const harnessItems = harnessSlashItems(provider, [...systemItems, ...repoItems], reported);
  return [...systemItems, ...repoItems, ...harnessItems];
}
