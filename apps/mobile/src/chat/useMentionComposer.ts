import { api, type AIProvider, type Id } from "@eva/backend";
import {
  acceptMentionTrigger,
  buildMentionPattern,
  buildSkillPattern,
  dataMentionItems,
  filterMentionItems,
  findMentionTrigger,
  harnessCatalogProvider,
  isInsertedTokenTrigger,
  mergeMentionItems,
  peopleMentionItems,
  shouldShowMentionPicker,
  skillSlashItems,
  tokenizeMentionText,
  tokenizedToEditable,
  type InsertedToken,
  type MentionChipKind,
  type MentionItem,
  type MentionTrigger,
} from "@eva/shared";
import { useQuery } from "convex/react";
import { useState } from "react";

/**
 * The composer text as the person reads it (`@Ada`, `/review`), with the
 * label → id of each pick so a send carries the web's tokens. Changes as one.
 */
type Draft = {
  text: string;
  mentionMap: ReadonlyMap<string, string>;
  skillMap: ReadonlyMap<string, string>;
  /** The chip the last pick inserted (see `isInsertedTokenTrigger`). */
  inserted: InsertedToken | null;
  /** The picker was closed (Android back, as the web Escape) and stays shut until the text changes. */
  dismissed: boolean;
};

const EMPTY_DRAFT: Draft = { text: "", mentionMap: new Map(), skillMap: new Map(), inserted: null, dismissed: false };

/** A pick still in the draft text: an `@` mention or a `/` skill, by its label. */
export type ComposerPick = { kind: MentionChipKind; label: string };

/** The labels of `map` whose `@Label` (or `/Label`) is still in `text`. */
function labelsIn(text: string, map: ReadonlyMap<string, string>, pattern: (labels: string[]) => RegExp): string[] {
  return [...map.keys()].filter((label) => pattern([label]).test(text));
}

/** The open picker: what it lists for the trigger the draft is typing. */
export type MentionMenuState = {
  trigger: MentionTrigger;
  rows: MentionItem[];
  /** Ids of teammates among the `@` rows (people and data tokens look alike). */
  peopleIds: ReadonlySet<string>;
  /** Whether there is anything to list at all, before the query filters it. */
  hasAny: boolean;
};

/**
 * The web chat composer's `@` mentions and `/` skills for the phone: the same
 * candidate queries (`teamMembers.listForRepo`, `mentions.listData`,
 * `repoSkills.listByRepo`, `repoSystemSkills.listForRepo`,
 * `harnessSkills.getForProvider`), the same trigger, filter and pick (from
 * `@eva/shared`), and `tokenize` builds the web's wire text on send.
 *
 * As the web on a touch screen, Return while the picker lists something picks
 * the first row instead of adding a line.
 */
export function useMentionComposer(repoId: Id<"githubRepos"> | undefined, provider: AIProvider | undefined) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const args = repoId ? { repoId } : "skip";
  const members = useQuery(api.teamMembers.listForRepo, args);
  const data = useQuery(api.mentions.listData, args);
  const repoSkills = useQuery(api.repoSkills.listByRepo, args);
  const systemSkills = useQuery(api.repoSystemSkills.listForRepo, args);
  const catalogProvider = harnessCatalogProvider(provider);
  const harnessCatalog = useQuery(
    api.harnessSkills.getForProvider,
    catalogProvider && repoId ? { provider: catalogProvider } : "skip",
  );

  const { items, peopleIds } = mergeMentionItems(peopleMentionItems(members ?? []), dataMentionItems(data ?? []));
  const skills = repoId ? skillSlashItems(repoSkills ?? [], systemSkills ?? [], provider, harnessCatalog?.skills) : [];

  // The web chat composer always has a `/` empty state ("No available skills."), so `/` always opens.
  const found = findMentionTrigger(draft.text, items.length > 0, true);
  const trigger = found && !isInsertedTokenTrigger(draft.text, found.startIndex, draft.inserted) ? found : null;
  const pool = trigger?.kind === "slash" ? skills : items;
  const menu: MentionMenuState | null =
    trigger && !draft.dismissed && shouldShowMentionPicker(trigger, { mentions: items.length, skills: skills.length, hasEmptySkills: true })
      ? { trigger, rows: filterMentionItems(pool, trigger.query), peopleIds, hasAny: pool.length > 0 }
      : null;

  const pick = (item: MentionItem) => {
    if (!trigger) return;
    const accepted = acceptMentionTrigger(draft.text, trigger, item.label);
    const slash = trigger.kind === "slash";
    setDraft({
      text: accepted.value,
      inserted: accepted.inserted,
      dismissed: false,
      mentionMap: slash ? draft.mentionMap : new Map(draft.mentionMap).set(item.label, item.id),
      skillMap: slash ? new Map(draft.skillMap).set(item.label, item.id) : draft.skillMap,
    });
  };

  const setText = (text: string) => {
    const first = menu?.rows[0];
    if (first && text === `${draft.text}\n`) {
      pick(first);
      return;
    }
    // An emptied field (cleared, or sent) drops the picks, as the web editor.
    if (text === "") {
      setDraft(EMPTY_DRAFT);
      return;
    }
    // The guard holds only while the chip it names is still there.
    const inserted = draft.inserted && text.startsWith(draft.inserted.token, draft.inserted.startIndex) ? draft.inserted : null;
    setDraft({ ...draft, text, inserted, dismissed: false });
  };

  /** Closes the picker until the next edit, as the web Escape (`closeTrigger`). */
  const dismiss = () => setDraft({ ...draft, dismissed: true });

  /** Adds stored tokenized text (a stash entry) after the draft, as the web stash restore. */
  const restore = (tokenized: string) => {
    const restored = tokenizedToEditable(tokenized);
    setDraft({
      text: draft.text.trim() === "" ? restored.displayText : `${draft.text}\n\n${restored.displayText}`,
      mentionMap: new Map([...draft.mentionMap, ...restored.mentionMap]),
      skillMap: new Map([...draft.skillMap, ...restored.skillMap]),
      inserted: null,
      dismissed: false,
    });
  };

  /** Takes a pick out: each `@Label` (or `/Label`) and the space after it, and its id. */
  const removePick = (pick: ComposerPick) => {
    const pattern = (pick.kind === "slash" ? buildSkillPattern : buildMentionPattern)([pick.label]);
    const without = (map: ReadonlyMap<string, string>) => new Map([...map].filter(([label]) => label !== pick.label));
    const text = draft.text.replace(new RegExp(`${pattern.source} ?`, "g"), "");
    if (text.trim() === "") {
      setDraft(EMPTY_DRAFT);
      return;
    }
    setDraft({
      text,
      inserted: null,
      dismissed: false,
      mentionMap: pick.kind === "at" ? without(draft.mentionMap) : draft.mentionMap,
      skillMap: pick.kind === "slash" ? without(draft.skillMap) : draft.skillMap,
    });
  };

  const picks: ComposerPick[] = [
    ...labelsIn(draft.text, draft.mentionMap, buildMentionPattern).map((label): ComposerPick => ({ kind: "at", label })),
    ...labelsIn(draft.text, draft.skillMap, buildSkillPattern).map((label): ComposerPick => ({ kind: "slash", label })),
  ];

  return {
    text: draft.text,
    /** The picks still in the text, `@` mentions first, as chips above the field. */
    picks,
    removePick,
    setText,
    menu,
    pick,
    dismiss,
    restore,
    /** The wire text for a send: each `@Label` / `/Label` picked becomes its token. */
    tokenize: (text: string) => tokenizeMentionText(text, draft),
  };
}
