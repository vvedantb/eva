import type { AIModel, BackgroundAgentEntry, Id } from "@eva/backend";

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
  /** Sends a harness slash command as a plain user message. */
  onSendCommand: (command: string) => void;
}
