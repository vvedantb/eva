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

type Draft = {
  text: string;
  mentionMap: ReadonlyMap<string, string>;
  skillMap: ReadonlyMap<string, string>;
  inserted: InsertedToken | null;
  dismissed: boolean;
};

const EMPTY_DRAFT: Draft = { text: "", mentionMap: new Map(), skillMap: new Map(), inserted: null, dismissed: false };

/** A pick still in the draft text: an `@` mention or a `/` skill, by its label. */
export type ComposerPick = { kind: MentionChipKind; label: string };

function labelsIn(text: string, map: ReadonlyMap<string, string>, pattern: (labels: string[]) => RegExp): string[] {
  return [...map.keys()].filter((label) => pattern([label]).test(text));
}

/** The open picker: what it lists for the trigger the draft is typing. */
export type MentionMenuState = {
  trigger: MentionTrigger;
  rows: MentionItem[];
  peopleIds: ReadonlySet<string>;
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
export function useMentionComposer(
  repoId: Id<"githubRepos"> | undefined,
  provider: AIProvider | undefined,
  onChange?: (tokenized: string) => void,
  extraPeople: readonly MentionItem[] = [],
) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const edit = (next: Draft) => {
    setDraft(next);
    if (next.text !== draft.text) onChange?.(tokenizeMentionText(next.text, next));
  };
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

  const merged = mergeMentionItems(peopleMentionItems(members ?? []), dataMentionItems(data ?? []));
  const items = [...extraPeople, ...merged.items];
  const peopleIds = new Set([...merged.peopleIds, ...extraPeople.map((item) => item.id)]);
  const skills = repoId ? skillSlashItems(repoSkills ?? [], systemSkills ?? [], provider, harnessCatalog?.skills) : [];

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
    edit({
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
    if (text === "") {
      edit(EMPTY_DRAFT);
      return;
    }
    const inserted = draft.inserted && text.startsWith(draft.inserted.token, draft.inserted.startIndex) ? draft.inserted : null;
    edit({ ...draft, text, inserted, dismissed: false });
  };

  const insertSkill = (item: MentionItem) => {
    const token = `/${item.label}`;
    const needsSpace = draft.text.length > 0 && !/\s$/.test(draft.text);
    edit({
      ...draft,
      text: `${draft.text}${needsSpace ? " " : ""}${token} `,
      inserted: { startIndex: draft.text.length + (needsSpace ? 1 : 0), token },
      dismissed: false,
      skillMap: new Map(draft.skillMap).set(item.label, item.id),
    });
  };

  const dismiss = () => setDraft({ ...draft, dismissed: true });

  const restore = (tokenized: string) => {
    const restored = tokenizedToEditable(tokenized);
    edit({
      text: draft.text.trim() === "" ? restored.displayText : `${draft.text}\n\n${restored.displayText}`,
      mentionMap: new Map([...draft.mentionMap, ...restored.mentionMap]),
      skillMap: new Map([...draft.skillMap, ...restored.skillMap]),
      inserted: null,
      dismissed: false,
    });
  };

  const removePick = (pick: ComposerPick) => {
    const pattern = (pick.kind === "slash" ? buildSkillPattern : buildMentionPattern)([pick.label]);
    const without = (map: ReadonlyMap<string, string>) => new Map([...map].filter(([label]) => label !== pick.label));
    const text = draft.text.replace(new RegExp(`${pattern.source} ?`, "g"), "");
    if (text.trim() === "") {
      edit(EMPTY_DRAFT);
      return;
    }
    edit({
      text,
      inserted: null,
      dismissed: false,
      mentionMap: pick.kind === "at" ? without(draft.mentionMap) : draft.mentionMap,
      skillMap: pick.kind === "slash" ? without(draft.skillMap) : draft.skillMap,
    });
  };

  const load = (tokenized: string) => {
    const loaded = tokenizedToEditable(tokenized);
    setDraft({
      text: loaded.displayText,
      mentionMap: loaded.mentionMap,
      skillMap: loaded.skillMap,
      inserted: null,
      dismissed: false,
    });
  };

  const picks: ComposerPick[] = [
    ...labelsIn(draft.text, draft.mentionMap, buildMentionPattern).map((label): ComposerPick => ({ kind: "at", label })),
    ...labelsIn(draft.text, draft.skillMap, buildSkillPattern).map((label): ComposerPick => ({ kind: "slash", label })),
  ];

  return {
    text: draft.text,
    picks,
    removePick,
    setText,
    menu,
    pick,
    dismiss,
    restore,
    skills,
    insertSkill,
    load,
    tokenize: (text: string) => tokenizeMentionText(text, draft),
  };
}
