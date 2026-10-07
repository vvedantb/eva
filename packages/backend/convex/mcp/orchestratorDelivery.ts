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
 * How a preview sandbox should be brought up before it is used.
 *
 * A completed entity tears its preview sandbox down (`closed`). Resuming that
 * id in-place hangs on "Resuming sandbox…"; the Start-button path
 * (`startTaskSandbox` → `startTaskPreviewSandbox`, and its session/project
 * twins) is the one that actually comes back. `starting`/`stopping` are
 * in-flight — wait, don't kick off a second start.
 *
 * All three surfaces share the same status vocabulary, so one decision covers
 * them: a session's `status`, a task's `reviewTaskSandboxStatus` and a
 * project's `reviewProjectSandboxStatus`.
 */
export type SandboxStartPlan = "run" | "start" | "wait";

export function decideSandboxStartPlan(
  status: string | undefined,
): SandboxStartPlan {
  if (status === "active") return "run";
  if (status === "starting" || status === "stopping") return "wait";
  return "start";
}

/** MCP follow-up waits this long for a closed preview sandbox to become active. */
export const TASK_PREVIEW_SANDBOX_READY_TIMEOUT_MS = 240_000;
export const TASK_PREVIEW_SANDBOX_READY_POLL_MS = 2_000;

/** A stop is only tracked until the VM settles; past that the caller is told. */
export const SANDBOX_STOP_SETTLE_TIMEOUT_MS = 120_000;

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
    idArg: "sessionId",
    // Sessions are the odd one out: the message insert lives in the sessions
    // module (and names its id argument `id`), the turn control in execution.
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

interface SandboxSurfaceMutations {
  /** Argument name the surface's sandbox mutations use for its entity id. */
  idArg: string;
  /** The exact mutation behind the surface's Start button in the Eva UI. */
  start: string;
  /** …and behind its Stop button. */
  stop: string;
}

/**
 * Start/Stop for each surface's preview sandbox, as the web app calls them.
 * Sessions carry their sandbox state in `status` itself; task and project
 * preview sandboxes have their own `review*SandboxStatus` field.
 */
export const SANDBOX_SURFACES: Record<ChatTargetKind, SandboxSurfaceMutations> =
  {
    session: {
      idArg: "sessionId",
      start: "sessions:startSandbox",
      stop: "sessions:stopSandbox",
    },
    task: {
      idArg: "taskId",
      start: "agentTasks:startTaskSandbox",
      stop: "agentTasks:stopTaskSandbox",
    },
    project: {
      idArg: "projectId",
      start: "projects:startProjectSandbox",
      stop: "projects:stopProjectSandbox",
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
  /** Stamps the "via MCP" chat badge. True for every MCP send. */
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
        // Sessions call this argument `id`; task and project chat name it
        // after their entity, like their other mutations.
        [kind === "session" ? "id" : surface.idArg]: id,
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
