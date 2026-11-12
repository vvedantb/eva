import { api, normalizeAIModel, type Id, type StoredModelTraits } from "@eva/backend";
import { toPickerAccounts } from "@eva/shared";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useMutation, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { ModelPick } from "@/chat/ModelChip";

/** An open chat (`mobile.getChat`). */
export type Chat = NonNullable<FunctionReturnType<typeof api.mobile.getChat>>;

/** Shows a pick on the open chat at once (`mobile.getChat`), before the server has it. */
function patchChat(store: OptimisticLocalStore, target: string, patch: (chat: Chat) => Partial<Chat>) {
  const current = store.getQuery(api.mobile.getChat, { target });
  if (current) store.setQuery(api.mobile.getChat, { target }, { ...current, ...patch(current) });
}

/** The traits a pick set over the ones the chat had. */
function mergeTraits(
  current: Chat["traits"],
  pick: { reasoningLevel?: Chat["traits"]["effortLevel"]; thinkingEnabled?: boolean; use1mContext?: boolean; fastMode?: boolean },
) {
  return {
    effortLevel: pick.reasoningLevel ?? current.effortLevel,
    thinkingEnabled: pick.thinkingEnabled ?? current.thinkingEnabled,
    use1mContext: pick.use1mContext ?? current.use1mContext,
    fastMode: pick.fastMode ?? current.fastMode,
  };
}

/**
 * The chat composer's model chip, wired as the web chat it opens. Every chat
 * (a session chat, a quick task's or project's Main chat, a project task's
 * own chat) picks its model and traits through `mobile.setChatModel`, which
 * creates a task's or project's session chat on first need. An account
 * switch saves on that session chat (created through `sessions.ensureOwned`
 * when missing), then waits for the new daemon (the web
 * `useProviderAccountHandoff`), and `switching` holds sends until then. The
 * account rows list what the web picker lists (the session's or task's
 * owner's accounts, the viewer's own for a project) and only for whoever the
 * web lets change it.
 */
export function useChatModelPick(target: string, chat: Chat | null | undefined, me: Id<"users"> | undefined) {
  const [switching, setSwitching] = useState(false);
  const sessionAccounts = useQuery(api.userProviderAccounts.listForSessionOwner, chat?.session ? { sessionId: chat.session.id } : "skip");
  const taskAccounts = useQuery(api.userProviderAccounts.listForTaskOwner, chat?.task ? { taskId: chat.task.id } : "skip");
  const ownAccounts = useQuery(api.userProviderAccounts.listSelectable, chat?.project ? {} : "skip");
  const setChatModel = useMutation(api.mobile.setChatModel).withOptimisticUpdate((store, pick) =>
    patchChat(store, target, (current) => ({ model: pick.model ?? current.model, traits: mergeTraits(current.traits, pick) })),
  );
  const setSessionAccount = useMutation(api.sessionChats.setProviderAccountId).withOptimisticUpdate((store, args) =>
    patchChat(store, target, () => ({ providerAccountId: args.providerAccountId ?? undefined })),
  );
  const ensureOwned = useMutation(api.sessions.ensureOwned);
  const prewarmSession = useAction(api.sessionWorkflow.prewarmDaemonNow);

  if (!chat) return { pick: undefined, switching };
  const { session, task, project } = chat;
  const sessionChatId = session?.chatId ?? task?.sessionChatId ?? project?.sessionChatId;
  // The chat to save an account on, created for a task or project on first need.
  const resolveChatId = async (): Promise<Id<"sessionChats"> | undefined> => {
    if (sessionChatId) return sessionChatId;
    if (task) return (await ensureOwned({ owner: { kind: "task", taskId: task.id } })).chatId;
    if (project) return (await ensureOwned({ owner: { kind: "project", projectId: project.id } })).chatId;
    return undefined;
  };

  const failed = () => toast.error("Couldn't change the model");
  const pickTraits = (partial: StoredModelTraits) => {
    setChatModel({
      target,
      reasoningLevel: partial.effortLevel,
      thinkingEnabled: partial.thinkingEnabled,
      use1mContext: partial.use1mContext,
      fastMode: partial.fastMode,
    }).catch(failed);
  };

  const changeAccount = (providerAccountId: Id<"userProviderAccounts"> | null) => {
    setSwitching(true);
    // Chained, not try / finally, which React Compiler cannot compile.
    resolveChatId()
      .then(async (chatId) => {
        if (!chatId) return;
        await setSessionAccount({ chatId, providerAccountId });
        await prewarmSession({ chatId });
      })
      .catch(() => toast.error("Couldn't switch the account"))
      .then(() => setSwitching(false));
  };
  const accounts = sessionAccounts ?? taskAccounts ?? ownAccounts;
  // The web lets only a task's or project's owner change its account.
  const canChangeAccount = chat.accountOwnerId === undefined || chat.accountOwnerId === me;

  const pick: Omit<ModelPick, "repoId"> = {
    model: normalizeAIModel(chat.model),
    traits: chat.traits,
    onModelChange: (model) => {
      setChatModel({ target, model }).catch(failed);
    },
    onTraitsChange: pickTraits,
    account:
      accounts && canChangeAccount
        ? { accounts: toPickerAccounts(accounts), value: chat.providerAccountId ?? null, onChange: changeAccount }
        : undefined,
  };
  return { pick, switching };
}
