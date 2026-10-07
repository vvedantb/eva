import type { SlashItem } from "@/lib/components/mentions";

/** How long the draft must sit still before Eva asks Jev about it. */
export const SUGGEST_IDLE_MS = 700;
/** Below this a draft is a greeting, not a request worth ranking skills for. */
export const SUGGEST_MIN_CHARS = 16;
/** Jev spreads probability across every option; a long list dilutes each one. */
export const SUGGEST_MIN_PROBABILITY = 0.15;
export const SUGGEST_MIN_NEEDS_SKILL = 0.5;
/** Chips are a hint above the composer, not a second picker. */
export const SUGGEST_MAX_CHIPS = 3;

export interface SkillSuggestionResponse {
  needsSkill: number;
  suggestions: { id: string; probability: number }[];
}

/**
 * Whether this draft is worth an evaluation. A half-typed `/` or `@` means the
 * picker is already open, so the chips would be arguing with it.
 */
export function shouldSuggestFor(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < SUGGEST_MIN_CHARS) return false;
  const lastWord = trimmed.split(/\s+/).at(-1) ?? "";
  return !lastWord.startsWith("/") && !lastWord.startsWith("@");
}

/**
 * The chips to show for one evaluation: the confident suggestions the user has
 * neither added nor dismissed, in Jev's order.
 */
export function pickSkillSuggestions(
  response: SkillSuggestionResponse | null,
  ctx: {
    text: string;
    skillItems: ReadonlyArray<SlashItem>;
    dismissed: ReadonlySet<string>;
  },
): SlashItem[] {
  if (response === null) return [];
  if (response.needsSkill < SUGGEST_MIN_NEEDS_SKILL) return [];
  const lowerText = ctx.text.toLowerCase();
  const picked: SlashItem[] = [];
  for (const suggestion of response.suggestions) {
    if (picked.length >= SUGGEST_MAX_CHIPS) break;
    if (suggestion.probability < SUGGEST_MIN_PROBABILITY) continue;
    if (ctx.dismissed.has(suggestion.id)) continue;
    const item = ctx.skillItems.find((skill) => skill.id === suggestion.id);
    if (!item) continue;
    // Already in the draft — offering to add it again is noise.
    if (lowerText.includes(`/${item.label.toLowerCase()}`)) continue;
    picked.push(item);
  }
  return picked;
}
