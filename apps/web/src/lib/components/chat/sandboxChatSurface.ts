import type {
  AgentGoal,
  AIModel,
  BackgroundAgentEntry,
  Id,
} from "@eva/backend";
import type { ModelAccount } from "@vvedantb/ui";
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

/**
 * What the usage-limit recovery card needs from a surface. `undefined` when
 * this viewer cannot move the chat onto another account: a read-only session,
 * or a task/project viewed by someone other than its owner (task and project
 * chat are owner-sticky; the account picker is gated the same way).
 */
interface UsageLimitRecoveryInputs {
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
  /** Claude's native `/goal` for this chat, mirrored by the daemon. */
  goal: AgentGoal | undefined;
  /**
   * Sends a harness slash command (e.g. `/goal clear`) as a normal chat
   * message, verbatim. Undefined when the chat cannot be written to.
   */
  sendCommand: ((command: string) => Promise<void>) | undefined;
}

/** The chat owner's doc fields a sandbox chat surface reads. */
export interface SandboxChatOwnerDoc {
  backgroundAgents?: BackgroundAgentEntry[];
  providerAccountId?: Id<"userProviderAccounts">;
  goal?: AgentGoal;
}

/**
 * The surface for a session, task or project sandbox chat. `doc` is the chat
 * owner's live record (undefined while it loads). `accounts` is the viewer's
 * own list, not a display list with a synthetic owner row: that row exists
 * only for non-owners, who never see the recovery card.
 */
export function buildSandboxChatSurface({
  entity,
  repoId,
  model,
  isExecuting,
  isReadOnly = false,
  doc,
  canSwitchAccount,
  messages,
  accounts,
  resolveAccountId,
  switchProviderAccount,
  isSandboxActive,
  sendCommand,
}: {
  entity: ChatEntityRef;
  repoId: Id<"githubRepos">;
  model: AIModel;
  isExecuting: boolean;
  isReadOnly?: boolean;
  doc: SandboxChatOwnerDoc | null | undefined;
  /**
   * The viewer may move the chat onto another account. Task and project chat
   * are owner-sticky; a read-only session cannot switch.
   */
  canSwitchAccount: boolean;
  messages: UsageLimitRecoveryInputs["messages"] | undefined;
  accounts: UsageLimitRecoveryInputs["accounts"];
  resolveAccountId: UsageLimitRecoveryInputs["resolveAccountId"];
  switchProviderAccount: UsageLimitRecoveryInputs["onSwitchAccount"];
  isSandboxActive: boolean;
  /**
   * Must skip the pending review comments: a slash command has to reach the
   * harness verbatim. Undefined when the chat cannot be written to.
   */
  sendCommand: SandboxChatSurface["sendCommand"];
}): SandboxChatSurface {
  return {
    entity,
    repoId,
    model,
    isExecuting,
    isReadOnly,
    backgroundAgents: doc?.backgroundAgents,
    usageLimitRecovery:
      canSwitchAccount && doc
        ? {
            messages: messages ?? [],
            accounts,
            resolveAccountId,
            currentAccountId: doc.providerAccountId ?? null,
            onSwitchAccount: switchProviderAccount,
            isSandboxActive,
          }
        : undefined,
    goal: doc?.goal,
    sendCommand,
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
