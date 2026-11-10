import { api, normalizeAIModel, type Id, type StoredModelTraits } from "@eva/backend";
import { toPickerAccounts } from "@eva/shared";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useMutation, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { ModelPick } from "@/chat/ModelChip";

type Chat = NonNullable<FunctionReturnType<typeof api.mobile.getChat>>;

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
 * The chat composer's model chip, wired as the web chat it opens: a session
 * or project chat picks through `mobile.setChatModel` (the web
 * `sessionChats` / `projects` writes), a quick task through the web task
 * chat's own `agentTasks.update` and `agentTasks.setTraits`, so the phone
 * sends on the `agentTasks.model` the web picks. The account rows list what
 * the web picker lists (the session's or task's owner's accounts, the
 * viewer's own for a project) and only for whoever the web lets change it; a
 * switch saves the account, then waits for the new daemon (the web
 * `useProviderAccountHandoff`), and `switching` holds sends until then.
 */
export function useChatModelPick(target: string, chat: Chat | null | undefined, me: Id<"users"> | undefined) {
  const [switching, setSwitching] = useState(false);
  const sessionAccounts = useQuery(api.userProviderAccounts.listForSessionOwner, chat?.session ? { sessionId: chat.session.id } : "skip");
  const taskAccounts = useQuery(api.userProviderAccounts.listForTaskOwner, chat?.task ? { taskId: chat.task.id } : "skip");
  const ownAccounts = useQuery(api.userProviderAccounts.listSelectable, chat?.project ? {} : "skip");
  const setChatModel = useMutation(api.mobile.setChatModel).withOptimisticUpdate((store, pick) =>
    patchChat(store, target, (current) => ({ model: pick.model ?? current.model, traits: mergeTraits(current.traits, pick) })),
  );
  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate((store, args) =>
    patchChat(store, target, (current) => ({
      model: args.model ?? current.model,
      providerAccountId: args.providerAccountId === undefined ? current.providerAccountId : (args.providerAccountId ?? undefined),
    })),
  );
  const setTaskTraits = useMutation(api.agentTasks.setTraits).withOptimisticUpdate((store, args) =>
    patchChat(store, target, (current) => ({ traits: mergeTraits(current.traits, args) })),
  );
  const setSessionAccount = useMutation(api.sessionChats.setProviderAccountId).withOptimisticUpdate((store, args) =>
    patchChat(store, target, () => ({ providerAccountId: args.providerAccountId ?? undefined })),
  );
  const updateProject = useMutation(api.projects.update).withOptimisticUpdate((store, args) =>
    patchChat(store, target, (current) => ({
      providerAccountId: args.providerAccountId === undefined ? current.providerAccountId : (args.providerAccountId ?? undefined),
    })),
  );
  const prewarmSession = useAction(api.sessionWorkflow.prewarmDaemonNow);
  const prewarmTask = useAction(api.agentTaskChatWorkflow.prewarmChatDaemonNow);
  const prewarmProject = useAction(api.projectChatWorkflow.prewarmChatDaemonNow);

  if (!chat) return { pick: undefined, switching };
  const { session, task, project } = chat;
  // A task chat from a backend without `task` cannot reach the task mutations.
  if (chat.kind === "task" && !task) return { pick: undefined, switching };

  const failed = () => toast.error("Couldn't change the model");
  const pickTraits = (partial: StoredModelTraits) => {
    const traits = {
      reasoningLevel: partial.effortLevel,
      thinkingEnabled: partial.thinkingEnabled,
      use1mContext: partial.use1mContext,
      fastMode: partial.fastMode,
    };
    (task ? setTaskTraits({ id: task.id, ...traits }) : setChatModel({ target, ...traits })).catch(failed);
  };

  const switchAccount = (persist: () => Promise<unknown>, prewarm: () => Promise<unknown>) => {
    setSwitching(true);
    // Chained, not try / finally, which React Compiler cannot compile.
    persist()
      .then(prewarm)
      .catch(() => toast.error("Couldn't switch the account"))
      .then(() => setSwitching(false));
  };
  const changeAccount = (providerAccountId: Id<"userProviderAccounts"> | null) => {
    if (session) {
      switchAccount(
        () => setSessionAccount({ chatId: session.chatId, providerAccountId }),
        () => prewarmSession({ chatId: session.chatId }),
      );
    } else if (task) {
      switchAccount(() => updateTask({ id: task.id, providerAccountId }), () => prewarmTask({ taskId: task.id }));
    } else if (project) {
      switchAccount(() => updateProject({ id: project.id, providerAccountId }), () => prewarmProject({ projectId: project.id }));
    }
  };
  const accounts = sessionAccounts ?? taskAccounts ?? ownAccounts;
  // The web lets only a task's or project's owner change its account.
  const canChangeAccount = chat.accountOwnerId === undefined || chat.accountOwnerId === me;

  const pick: Omit<ModelPick, "repoId"> = {
    model: normalizeAIModel(chat.model),
    traits: chat.traits,
    onModelChange: (model) => {
      (task ? updateTask({ id: task.id, model }) : setChatModel({ target, model })).catch(failed);
    },
    onTraitsChange: pickTraits,
    account:
      accounts && canChangeAccount
        ? { accounts: toPickerAccounts(accounts), value: chat.providerAccountId ?? null, onChange: changeAccount }
        : undefined,
  };
  return { pick, switching };
}
