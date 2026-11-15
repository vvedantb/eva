import { api, type Id } from "@eva/backend";
import { decideDraftPull, rememberOwnSave } from "@eva/shared";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { Chat } from "@/chat/useChatModelPick";

type DraftTarget = { kind: "sessionChat"; sessionId: Id<"sessions">; chatId: Id<"sessionChats"> };
type SaveDraft = (args: { target: DraftTarget; content: string }) => Promise<null>;

/**
 * Per chat: the contents this client put on the server or took from it (the
 * echo guard), the last content saved, and the one save in flight with the
 * newest content waiting behind it. Module scope, not component state: there is
 * one composer per chat, and a late echo must still be recognised after the
 * screen remounts.
 */
type DraftSync = { ownSaves: string[]; lastSaved: string | null; inFlight: boolean; next: string | null };
const syncs = new Map<string, DraftSync>();

function syncFor(chatId: string): DraftSync {
  const existing = syncs.get(chatId);
  if (existing) return existing;
  const created: DraftSync = { ownSaves: [], lastSaved: null, inFlight: false, next: null };
  syncs.set(chatId, created);
  return created;
}

/** Sends the newest waiting content, one save at a time, so fast typing coalesces (the web's `useSingleFlight`). */
async function flush(sync: DraftSync, save: SaveDraft, target: DraftTarget) {
  sync.inFlight = true;
  while (sync.next !== null) {
    const content = sync.next;
    sync.next = null;
    try {
      // One at a time on purpose: a later save must not land before an earlier one.
      // eslint-disable-next-line no-await-in-loop
      await save({ target, content });
    } catch {
      // Offline or signed out: the next edit saves again.
    }
  }
  sync.inFlight = false;
}

/**
 * The composer draft of a session chat, kept on the server (`drafts`) as the
 * web composer does, so it survives closing the app and follows the person
 * between the phone and the web. Quick tasks and projects have no draft row,
 * as on the web.
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
export function useChatDraftSync(chat: Chat) {
  const target: DraftTarget | null = chat.session
    ? { kind: "sessionChat", sessionId: chat.session.id, chatId: chat.session.chatId }
    : null;
  const remote = useQuery(api.drafts.getForTarget, target ? { target } : "skip");
  const setDraft = useMutation(api.drafts.set);
  // The saved draft value this screen has already considered.
  const [considered, setConsidered] = useState<string | null | undefined>(undefined);

  const save = (tokenized: string) => {
    if (!target || remote === undefined) return;
    const sync = syncFor(target.chatId);
    if (tokenized === sync.lastSaved) return;
    sync.lastSaved = tokenized;
    sync.ownSaves = rememberOwnSave(sync.ownSaves, tokenized);
    sync.next = tokenized;
    if (!sync.inFlight) void flush(sync, setDraft, target);
  };

  const pull = (composer: { text: string; load: (tokenized: string) => void }) => {
    if (!target || remote === considered) return;
    setConsidered(remote);
    const sync = syncFor(target.chatId);
    const decision = decideDraftPull({ remoteContent: remote, editorValue: composer.text, ownSaves: sync.ownSaves });
    if (!decision.apply || typeof remote !== "string") return;
    // Taken from the server: it is already saved, and its echo is ours.
    sync.lastSaved = remote;
    sync.ownSaves = rememberOwnSave(sync.ownSaves, remote);
    composer.load(remote);
  };

  return { save, pull };
}
