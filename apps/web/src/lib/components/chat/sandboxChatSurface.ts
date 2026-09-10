import type { AIModel, BackgroundAgentEntry, Id } from "@eva/backend";
import type { ModelAccount } from "@eva/ui";
import type { ChatBodyMessage } from "./chatBodyUtils";

/**
 * Which chat a sandbox surface belongs to. Sessions, quick tasks and projects
 * each own a transcript and a sandbox, and every shared chat piece needs to
 * address the right one.
 */
export type ChatEntityRef =
  | { kind: "session"; sessionId: Id<"sessions"> }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };

interface ChatEntityKeys {
  /** Transcript owner — `api.messages.listByParent` / `queuedMessages`. */
  parentId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;
  /** `api.streaming.get` entity id for that surface's chat turn. */
  streamingEntityId: string;
}

/** The Convex query keys each surface's chat is stored under. */
export function chatEntityKeys(entity: ChatEntityRef): ChatEntityKeys {
  switch (entity.kind) {
    case "session":
      return {
        parentId: entity.sessionId,
        streamingEntityId: entity.sessionId,
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
  /** The chat's current model — only Claude is offered `/compact`. */
  model: AIModel;
  /** A running turn owns the context; never interrupt it with an offer. */
  isExecuting: boolean;
  /** The chat cannot be written to at all — hides per-agent stop buttons. */
  isReadOnly: boolean;
  /**
   * Whether `/compact` cannot be sent right now. Separate from `isReadOnly`:
   * sessions wake their sandbox on send (so a stopped sandbox still qualifies),
   * while task and project chats can only send while the sandbox runs.
   */
  compactionReadOnly: boolean;
  backgroundAgents: BackgroundAgentEntry[] | undefined;
  /** What the usage-limit recovery card needs, or nothing when it cannot show. */
  usageLimitRecovery: UsageLimitRecoveryInputs | undefined;
  /** Sends a harness slash command as a plain user message. */
  onSendCommand: (command: string) => void;
}
