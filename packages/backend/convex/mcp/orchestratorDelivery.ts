import { normalizeAIModel, type AIModel } from "../validators";

/**
 * How an orchestrator-sent message must reach a child agent.
 *
 * - `queue`  — the agent already has a workflow in flight, so the message goes
 *              into `queuedMessages` and the queue drain inserts the user row.
 * - `start`  — the agent is idle, so the caller must insert the user message
 *              itself and then kick off a turn.
 */
export type AgentDelivery =
  | { action: "queue"; model: AIModel }
  | { action: "start"; model: AIModel };

/**
 * Pure busy-vs-queue + model-fallback decision for `send_agent_message`.
 *
 * The stored model is the fallback when the caller names none, and an explicit
 * `requestedModel` wins even when it belongs to another provider.
 * `normalizeAIModel` supplies the platform default when neither is set.
 */
export function resolveAgentDelivery(input: {
  isBusy: boolean;
  requestedModel?: string;
  storedModel?: string;
}): AgentDelivery {
  const model = normalizeAIModel(input.requestedModel ?? input.storedModel);
  return input.isBusy ? { action: "queue", model } : { action: "start", model };
}

/**
 * The three chat surfaces a message can be sent into: a session, a quick
 * task's sandbox chat, or a project's sandbox chat. Each is a separate
 * workflow slot, so "busy" means something different on each (see
 * `orchestratorSendMessage`).
 */
export type ChatTargetKind = "session" | "task" | "project";

/** One mutation to run as the sending user, by Convex function path. */
export interface SessionMessageCall {
  fn: string;
  args: Record<string, string | boolean>;
}

interface ChatSurfaceMutations {
  /** Argument name the surface's mutations use for its entity id. */
  idArg: string;
  addMessage: string;
  startExecute: string;
  enqueueMessage: string;
  /**
   * Whether the surface's mutations declare `sentViaOrchestrator`. Convex
   * rejects an argument no validator declares, so the flag can only be passed
   * where it exists — project chat has no orchestrator badge because the
   * master session cannot drive a project.
   */
  orchestratorBadge: boolean;
}

const CHAT_SURFACES: Record<ChatTargetKind, ChatSurfaceMutations> = {
  session: {
    // A session message lands in one of its chats, so the id handed to these
    // mutations is the chat id resolved by `sessionChats:resolveDeliveryChat`.
    idArg: "chatId",
    addMessage: "_sessions/mutations:addMessage",
    startExecute: "_sessions/execution:startExecute",
    enqueueMessage: "_sessions/execution:enqueueMessage",
    orchestratorBadge: true,
  },
  task: {
    idArg: "taskId",
    addMessage: "agentTaskChatWorkflow:addMessage",
    startExecute: "agentTaskChatWorkflow:startExecute",
    enqueueMessage: "agentTaskChatWorkflow:enqueueMessage",
    orchestratorBadge: true,
  },
  project: {
    idArg: "projectId",
    addMessage: "projectChatWorkflow:addMessage",
    startExecute: "projectChatWorkflow:startExecute",
    enqueueMessage: "projectChatWorkflow:enqueueMessage",
    orchestratorBadge: false,
  },
};

/**
 * The mutations that put one message into an existing chat, in order. Shared
 * by every MCP send path (master session and user token alike) so a message
 * from outside the web app lands exactly as a composer send does — and never
 * as a new task, session or project.
 *
 * `start` is two calls because `startExecute` only stages the assistant
 * placeholder: the user row has to be inserted first or the turn runs with no
 * visible prompt. `queue` is one, because the queue drain inserts the user row
 * itself on dequeue.
 */
export function buildChatMessageCalls(input: {
  kind: ChatTargetKind;
  id: string;
  message: string;
  delivery: AgentDelivery;
  /** Stamps the "via master" chat badge. True only for orchestrator sends. */
  sentViaOrchestrator: boolean;
}): SessionMessageCall[] {
  const { kind, id, message, delivery, sentViaOrchestrator } = input;
  const surface = CHAT_SURFACES[kind];
  const badge: Record<string, boolean> = surface.orchestratorBadge
    ? { sentViaOrchestrator }
    : {};

  if (delivery.action === "queue") {
    return [
      {
        fn: surface.enqueueMessage,
        args: {
          [surface.idArg]: id,
          message,
          model: delivery.model,
          ...badge,
        },
      },
    ];
  }

  return [
    {
      fn: surface.addMessage,
      args: {
        [surface.idArg]: id,
        role: "user",
        content: message,
        model: delivery.model,
        ...badge,
      },
    },
    {
      fn: surface.startExecute,
      args: { [surface.idArg]: id, message, model: delivery.model },
    },
  ];
}
