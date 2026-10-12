import type { AIModel, BackgroundAgentEntry, Id } from "@eva/backend";
import type { ModelAccount } from "@eva/ui";
import type { ChatBodyMessage } from "./chatBodyUtils";

/**
 * Which chat a sandbox surface belongs to. Sessions, quick tasks and projects
 * each own a transcript and a sandbox, and every shared chat piece needs to
 * address the right one.
 */
export type ChatEntityRef =
  | { kind: "session"; sessionId: Id<"sessions">; chatId: Id<"sessionChats"> }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };

interface ChatEntityKeys {
  /** Transcript owner — `api.messages.listByParent` / `queuedMessages`. */
  parentId: Id<"sessionChats"> | Id<"agentTasks"> | Id<"projects">;
  /** `api.streaming.get` entity id for that surface's chat turn. */
  streamingEntityId: string;
}

/** The Convex query keys each surface's chat is stored under. */
export function chatEntityKeys(entity: ChatEntityRef): ChatEntityKeys {
  switch (entity.kind) {
    case "session":
      // A session's transcript, turn and daemon all belong to one of its chats.
      return {
        parentId: entity.chatId,
        streamingEntityId: entity.chatId,
      };
    case "task":
      return {
        parentId: entity.taskId,
        streamingEntityId: `task-chat-${entity.taskId}`,
      };
    case "project":
      return {
        parentId: entity.projectId,
        streamingEntityId: `project-chat-${entity.projectId}`,
      };
  }
}

/**
 * What the usage-limit recovery card needs from a surface. `undefined` when
 * this viewer cannot move the chat onto another account: a read-only session,
 * or a task/project viewed by someone other than its owner (task and project
 * chat are owner-sticky; the account picker is gated the same way).
 */
export interface UsageLimitRecoveryInputs {
  messages: ReadonlyArray<ChatBodyMessage>;
  accounts: ReadonlyArray<ModelAccount>;
  /** Maps a picker id string back to the branded id from the live docs. */
  resolveAccountId: (
    id: string | null,
  ) => Id<"userProviderAccounts"> | undefined;
  /** undefined while the entity query loads; null = Team credential. */
  currentAccountId: Id<"userProviderAccounts"> | null | undefined;
  /** Persists the sticky account and waits for the daemon handoff. */
  onSwitchAccount: (id: Id<"userProviderAccounts"> | null) => Promise<void>;
  isSandboxActive: boolean;
}

/**
 * What a sandbox chat surface has to tell the shared pre-input stack
 * (`SandboxChatPreInput`). Deliberately the minimum that stack reads — extend
 * it when a shared piece actually needs more, not before.
 */
export interface SandboxChatSurface {
  entity: ChatEntityRef;
  repoId: Id<"githubRepos">;
  /** The chat's current model. */
  model: AIModel;
  /** A running turn owns the context; never interrupt it with an offer. */
  isExecuting: boolean;
  /** The chat cannot be written to at all — hides per-agent stop buttons. */
  isReadOnly: boolean;
  backgroundAgents: BackgroundAgentEntry[] | undefined;
  /** What the usage-limit recovery card needs, or nothing when it cannot show. */
  usageLimitRecovery: UsageLimitRecoveryInputs | undefined;
}

/** The task or project doc fields a sandbox chat surface reads. */
interface SandboxChatOwnerDoc {
  backgroundAgents?: BackgroundAgentEntry[];
  providerAccountId?: Id<"userProviderAccounts">;
}

/**
 * The surface for a task or project sandbox chat. `doc` is the entity's live
 * record (undefined while it loads). `accounts` is the viewer's own list, not
 * a display list with a synthetic owner row: that row exists only for
 * non-owners, who never see the recovery card.
 */
export function buildSandboxChatSurface({
  entity,
  repoId,
  model,
  isExecuting,
  doc,
  isOwner,
  messages,
  accounts,
  resolveAccountId,
  switchProviderAccount,
  isSandboxActive,
}: {
  entity: ChatEntityRef;
  repoId: Id<"githubRepos">;
  model: AIModel;
  isExecuting: boolean;
  doc: SandboxChatOwnerDoc | null | undefined;
  isOwner: boolean;
  messages: UsageLimitRecoveryInputs["messages"] | undefined;
  accounts: UsageLimitRecoveryInputs["accounts"];
  resolveAccountId: UsageLimitRecoveryInputs["resolveAccountId"];
  switchProviderAccount: UsageLimitRecoveryInputs["onSwitchAccount"];
  isSandboxActive: boolean;
}): SandboxChatSurface {
  return {
    entity,
    repoId,
    model,
    isExecuting,
    isReadOnly: false,
    // A stopped sandbox cannot run `/compact`, so it counts as read-only here.
    backgroundAgents: doc?.backgroundAgents,
    // Owner-only, like the account picker: task and project chat are
    // owner-sticky.
    usageLimitRecovery:
      isOwner && doc
        ? {
            messages: messages ?? [],
            accounts,
            resolveAccountId,
            currentAccountId: doc.providerAccountId ?? null,
            onSwitchAccount: switchProviderAccount,
            isSandboxActive,
          }
        : undefined,
    // No review-comment append on this send path (sessions-only), so a slash
    // command already reaches the harness verbatim.
  };
}

/** The empty-state "Start sandbox" action, only while it can act. */
export function startSandboxHandler(
  isSandboxActive: boolean,
  isSandboxToggling: boolean,
  onSandboxToggle: ((action: "start" | "stop") => void) | undefined,
): (() => void) | undefined {
  return !isSandboxActive && !isSandboxToggling && onSandboxToggle
    ? () => onSandboxToggle("start")
    : undefined;
}
