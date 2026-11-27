import { api } from "@eva/backend";
import { decideDraftPull, rememberOwnSave } from "@eva/shared";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useState } from "react";

/** What a draft belongs to: a session chat, or a task comment (a reply when it has `parentCommentId`). */
export type DraftTarget = FunctionArgs<
  typeof api.drafts.getForTarget
>["target"];
type SaveDraft = (args: {
  target: DraftTarget;
  content: string;
}) => Promise<null>;

function targetKey(target: DraftTarget): string {
  return target.kind === "sessionChat"
    ? `sessionChat:${target.chatId}`
    : `taskComment:${target.taskId}:${target.parentCommentId ?? ""}`;
}

type DraftSync = {
  ownSaves: string[];
  lastSaved: string | null;
  inFlight: boolean;
  next: string | null;
};
const syncs = new Map<string, DraftSync>();

function syncFor(key: string): DraftSync {
  const existing = syncs.get(key);
  if (existing) return existing;
  const created: DraftSync = {
    ownSaves: [],
    lastSaved: null,
    inFlight: false,
    next: null,
  };
  syncs.set(key, created);
  return created;
}

async function flush(sync: DraftSync, save: SaveDraft, target: DraftTarget) {
  sync.inFlight = true;
  while (sync.next !== null) {
    const content = sync.next;
    sync.next = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      await save({ target, content });
    } catch {
    }
  }
  sync.inFlight = false;
}

/**
 * A composer draft kept on the server (`drafts`) as the web composers keep
 * theirs, so it survives closing the app and follows the person between the
 * phone and the web: a session chat's composer, and a task's comment and reply
 * boxes. `target` null (a quick task or project chat, which have no draft row,
 * as on the web) syncs nothing.
 *
 * - `save`: the composer's `onChange`, so only the person's edits save
 *   (typing, picks, a stash restore, the clear after a send, which deletes the
 *   row). Nothing saves before the saved draft has loaded, so opening a chat
 *   never overwrites it.
 * - `pull(composer)`: call during render, after the composer. When the saved
 *   draft changes (its first load, or a write from the web), it goes into the
 *   composer by the web's rules (`decideDraftPull`: never wipes the editor,
 *   ignores this client's echoes, only takes text that adds to what is typed).
 *   It adjusts state when the query changes, so no effect is needed.
 */
export function useDraftSync(target: DraftTarget | null) {
  const remote = useQuery(
    api.drafts.getForTarget,
    target ? { target } : "skip",
  );
  const setDraft = useMutation(api.drafts.set);
  const [considered, setConsidered] = useState<string | null | undefined>(
    undefined,
  );

  const save = (tokenized: string) => {
    if (!target || remote === undefined) return;
    const sync = syncFor(targetKey(target));
    if (tokenized === sync.lastSaved) return;
    sync.lastSaved = tokenized;
    sync.ownSaves = rememberOwnSave(sync.ownSaves, tokenized);
    sync.next = tokenized;
    if (!sync.inFlight) void flush(sync, setDraft, target);
  };

  const pull = (composer: {
    text: string;
    load: (tokenized: string) => void;
  }) => {
    if (!target || remote === considered) return;
    setConsidered(remote);
    const sync = syncFor(targetKey(target));
    const decision = decideDraftPull({
      remoteContent: remote,
      editorValue: composer.text,
      ownSaves: sync.ownSaves,
    });
    if (!decision.apply || typeof remote !== "string") return;
    sync.lastSaved = remote;
    sync.ownSaves = rememberOwnSave(sync.ownSaves, remote);
    composer.load(remote);
  };

  const lastKnown = (other: DraftTarget): string | null =>
    syncs.get(targetKey(other))?.lastSaved ?? null;

  return { save, pull, lastKnown };
}
