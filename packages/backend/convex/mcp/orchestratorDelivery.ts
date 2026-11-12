import {
  normalizeAIModel,
  type AIModel,
  type ChatEntityKind,
} from "../validators";

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
 * How a session's sandbox should be brought up before it is used.
 *
 * A retired session tears its sandbox down (`closed`). Resuming that id
 * in-place hangs on "Resuming sandbox…"; the Start-button path
 * (`sessions.startSandbox`) is the one that actually comes back.
 * `starting`/`stopping` are in-flight — wait, don't kick off a second start.
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

/** The I/O a caller supplies to `awaitSandboxActive`; the loop itself is pure. */
export interface AwaitSandboxActiveDeps {
  kind: ChatTargetKind;
  readStatus: () => Promise<string | undefined>;
  /** Issues the surface's Start mutation (as the acting user). */
  start: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  pollMs?: number;
}

/**
 * Brings one entity's preview sandbox up and waits until it is actually
 * `active`. Shared by the MCP `start_sandbox` path and the `/p/…` wake link,
 * so a sandbox woken from a saved link follows exactly the Start-button path
 * the Eva UI uses, including the stop/start race handling.
 *
 * Returns whether it had to issue a start; throws — rather than returning a
 * half-started sandbox — when the VM never comes up.
 */
export async function awaitSandboxActive(
  deps: AwaitSandboxActiveDeps,
): Promise<{ startRequested: boolean }> {
  const now = deps.now ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? TASK_PREVIEW_SANDBOX_READY_TIMEOUT_MS;
  const pollMs = deps.pollMs ?? TASK_PREVIEW_SANDBOX_READY_POLL_MS;

  const plan = decideSandboxStartPlan(await deps.readStatus());
  if (plan === "run") return { startRequested: false };

  let started = false;
  const start = async () => {
    await deps.start();
    started = true;
  };

  // `wait` is a start/stop already in flight. If that settles to `closed`,
  // start once rather than failing on a teardown race.
  if (plan === "start") {
    await start();
  }
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const next = decideSandboxStartPlan(await deps.readStatus());
    if (next === "run") return { startRequested: started };
    if (next === "start") {
      if (started) {
        throw new Error(
          `The ${deps.kind} sandbox did not become ready. Start it from the sandbox panel and retry.`,
        );
      }
      await start();
    }
    await deps.sleep(pollMs);
  }
  throw new Error(
    `Timed out waiting for the ${deps.kind} sandbox to start. Start it from the sandbox panel and retry.`,
  );
}

/** A stop is only tracked until the VM settles; past that the caller is told. */
export const SANDBOX_STOP_SETTLE_TIMEOUT_MS = 120_000;

/**
 * What an MCP caller can name: a session, a quick task or a project. A task
 * or project is delivered to the chat it talks in on its session (see
 * `orchestratorSendMessage`).
 */
export type ChatTargetKind = ChatEntityKind;

/** One mutation to run as the sending user, by Convex function path. */
export interface SessionMessageCall {
  fn: string;
  args: Record<string, string | boolean>;
}

/** A session chat's send mutations; every MCP send lands in one. */
const SESSION_CHAT_MUTATIONS = {
  addMessage: "_sessions/mutations:addMessage",
  startExecute: "_sessions/execution:startExecute",
  enqueueMessage: "_sessions/execution:enqueueMessage",
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
  /** The session chat the message lands in. */
  chatId: string;
  message: string;
  delivery: AgentDelivery;
  /** Stamps the "via MCP" chat badge. True for every MCP send. */
  sentViaOrchestrator: boolean;
}): SessionMessageCall[] {
  const { chatId, message, delivery, sentViaOrchestrator } = input;

  if (delivery.action === "queue") {
    return [
      {
        fn: SESSION_CHAT_MUTATIONS.enqueueMessage,
        args: { chatId, message, model: delivery.model, sentViaOrchestrator },
      },
    ];
  }

  return [
    {
      fn: SESSION_CHAT_MUTATIONS.addMessage,
      args: {
        chatId,
        role: "user",
        content: message,
        model: delivery.model,
        sentViaOrchestrator,
      },
    },
    {
      fn: SESSION_CHAT_MUTATIONS.startExecute,
      args: { chatId, message, model: delivery.model },
    },
  ];
}
