"use node";

import { v } from "convex/values";
import { dynamicTool, isStepCount, streamText, type ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { buildModelMessages } from "../_ave/context";
import {
  classifyGatewayError,
  type GatewayFailure,
} from "../_ai/gatewayErrors";
import { buildTools } from "./tools";
import type { EvaTool } from "./registry";

/**
 * One Manager Ave run: a server-side tool loop on a fixed model through AI
 * Gateway. No sandbox, no repo, no model choice — Ave only orchestrates, so
 * its whole tool set is the allowlist below, called in-process through the same
 * `EvaTool`s every MCP client gets (so the same as-the-user access checks).
 *
 * Lives beside `nodeActions.ts` rather than in `_ave/` because it imports
 * `buildTools`; the isolate-runtime Ave modules must not import a "use node"
 * chunk. Deliberately not a durable workflow: a replayed step would repeat a
 * `create_session`.
 */

export const AVE_MODEL = "openai/gpt-6-luna";

/** Orchestration only. Every name here must be named in `_ave/prompt.ts`. */
export const AVE_TOOL_NAMES = [
  "list_repos",
  "list_agents",
  "list_entities",
  "get_agent_state",
  "send_agent_message",
  "create_session",
  "create_task",
  "create_and_run_task",
  "create_tasks_batch",
  "stop_agent",
  "cancel_queued_message",
  "list_pending_questions",
  "answer_pending_question",
  "watch_agent",
  "unwatch_agent",
  "get_preview_url",
] as const;

const MAX_STEPS = 25;
/** Well inside the 10-minute action limit, so the run always reaches finishRun. */
const TOTAL_TIMEOUT_MS = 8 * 60_000;
const STEP_TIMEOUT_MS = 3 * 60_000;
const PUBLISH_INTERVAL_MS = 400;
/** Tool output kept in the chat step and in the replayed model context. */
const STEP_OUTPUT_CHARS = 2_000;
const REPLAY_TOOL_OUTPUT_CHARS = 4_000;
const REPLAY_TOTAL_CHARS = 200_000;

/** The `ActivityStep` JSON shape the shared chat UI renders (`@eva/ui`). */
type AveStep = {
  type: "tool" | "response";
  label: string;
  detail?: string;
  status: "active" | "complete";
  toolUseId?: string;
  output?: { text: string; truncated?: boolean };
  isError?: boolean;
};

function capText(text: string, limit: number): { text: string; truncated: boolean } {
  return text.length > limit
    ? { text: `${text.slice(0, limit)}…`, truncated: true }
    : { text, truncated: false };
}

function toolLabel(name: string): string {
  const words = name.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A short, human line for the step: the argument a person would look for. */
function toolDetail(input: string): string | undefined {
  const parsed = z
    .object({
      title: z.string().optional(),
      repoName: z.string().optional(),
      message: z.string().optional(),
      id: z.string().optional(),
    })
    .safeParse(JSON.parse(input));
  if (!parsed.success) return undefined;
  const { title, repoName, message, id } = parsed.data;
  const detail = title ?? message ?? id ?? repoName;
  return detail === undefined ? undefined : capText(detail, 120).text;
}

const callToolTextSchema = z.object({
  isError: z.boolean().optional(),
  content: z.array(
    z.union([
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.string() }),
    ]),
  ),
});

/** Flattens an MCP `CallToolResult` into the text the model reads. */
function callToolResultText(result: object): string {
  const parsed = callToolTextSchema.safeParse(result);
  if (!parsed.success) return JSON.stringify(result);
  const text = parsed.data.content
    .map((item) => ("text" in item ? item.text : `[${item.type}]`))
    .join("\n");
  return parsed.data.isError === true ? `Error: ${text}` : text;
}

/** The allowlisted Eva tools as AI SDK tools. Throws if one was renamed away. */
export function selectAveTools(evaTools: readonly EvaTool[]): EvaTool[] {
  const byName = new Map(evaTools.map((tool) => [tool.name, tool]));
  return AVE_TOOL_NAMES.map((name) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`Manager Ave tool "${name}" is not registered`);
    return tool;
  });
}

function toAiTools(evaTools: readonly EvaTool[]): ToolSet {
  const tools: ToolSet = {};
  for (const evaTool of evaTools) {
    tools[evaTool.name] = dynamicTool({
      description: evaTool.description,
      inputSchema: z.object(evaTool.inputShape),
      // `invoke` re-parses with the tool's own schema: the boundary check.
      execute: async (input) =>
        callToolResultText(await evaTool.invoke(JSON.stringify(input))),
    });
  }
  return tools;
}

/** Caps tool outputs so a replayed run cannot blow the next run's context. */
function capReplay(messages: ReadonlyArray<object>): string | undefined {
  const capped = JSON.stringify(messages, (_key, value) =>
    typeof value === "string" && value.length > REPLAY_TOOL_OUTPUT_CHARS
      ? `${value.slice(0, REPLAY_TOOL_OUTPUT_CHARS)}…`
      : value,
  );
  return capped.length > REPLAY_TOTAL_CHARS ? undefined : capped;
}

function describeFailure(failure: GatewayFailure): string {
  switch (failure.kind) {
    case "auth":
      return `AI Gateway rejected AI_GATEWAY_API_KEY: ${failure.message}`;
    case "model_not_found":
      return `${AVE_MODEL} is not available on AI Gateway: ${failure.message}`;
    case "rate_limit":
      return `AI Gateway rate limit: ${failure.message}. Try again shortly.`;
    case "timeout":
      return `The model did not answer in time: ${failure.message}`;
    case "gateway":
      return `AI Gateway error ${failure.statusCode ?? "unknown"}: ${failure.message}`;
    case "invalid_request":
    case "malformed_response":
    case "other":
      return failure.message;
  }
}

/**
 * Coalesces progress writes: at most one in flight, the latest state wins, and
 * the stream never waits on it. The mutation's answer doubles as the cancel
 * poll, so a Stop reaches the loop without a separate query.
 */
function progressPublisher(
  ctx: ActionCtx,
  threadId: Id<"aveThreads">,
  runId: string,
  onStop: () => void,
) {
  let pending: { content: string; activity: string } | null = null;
  let inFlight: Promise<void> | null = null;
  let lastSentAt = 0;

  async function drain(): Promise<void> {
    while (pending !== null) {
      const next = pending;
      pending = null;
      lastSentAt = Date.now();
      const { stop } = await ctx.runMutation(internal._ave.run.publishProgress, {
        threadId,
        runId,
        ...next,
      });
      if (stop) onStop();
    }
    inFlight = null;
  }

  return {
    publish(state: { content: string; activity: string }, force: boolean) {
      pending = state;
      if (inFlight !== null) return;
      if (!force && Date.now() - lastSentAt < PUBLISH_INTERVAL_MS) return;
      inFlight = drain();
    },
    async flush(): Promise<void> {
      if (inFlight !== null) await inFlight;
    },
  };
}

export const run = internalAction({
  args: { threadId: v.id("aveThreads"), runId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, runId }) => {
    const claim = await ctx.runMutation(internal._ave.run.claimRun, {
      threadId,
      runId,
    });
    if (claim === null) return null;

    const steps: AveStep[] = [];
    let text = "";
    let stepText = "";
    let error: string | undefined;
    let modelMessages: string | undefined;
    let stopped = false;
    const controller = new AbortController();
    const activity = () => JSON.stringify(steps);
    const publisher = progressPublisher(ctx, threadId, runId, () => {
      stopped = true;
      controller.abort();
    });

    try {
      if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
        throw new Error("AI_GATEWAY_API_KEY is not set on this Convex deployment.");
      }
      const tools = toAiTools(
        selectAveTools(
          buildTools(
            { clerkUserId: claim.clerkUserId, aveThreadId: threadId },
            ctx,
          ),
        ),
      );
      const result = streamText({
        model: AVE_MODEL,
        instructions: claim.instructions,
        messages: buildModelMessages(claim.rows),
        tools,
        stopWhen: [isStepCount(MAX_STEPS), () => stopped],
        timeout: { totalMs: TOTAL_TIMEOUT_MS, stepMs: STEP_TIMEOUT_MS },
        abortSignal: controller.signal,
        maxRetries: 2,
        providerOptions: { gateway: { tags: ["manager-ave"] } },
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            text += part.text;
            stepText += part.text;
            publisher.publish({ content: text, activity: activity() }, false);
            break;
          case "tool-call":
            steps.push({
              type: "tool",
              label: toolLabel(part.toolName),
              detail: toolDetail(JSON.stringify(part.input)),
              status: "active",
              toolUseId: part.toolCallId,
            });
            publisher.publish({ content: text, activity: activity() }, true);
            break;
          case "tool-result":
          case "tool-error": {
            const step = steps.find((s) => s.toolUseId === part.toolCallId);
            if (step) {
              const raw =
                part.type === "tool-result"
                  ? typeof part.output === "string"
                    ? part.output
                    : JSON.stringify(part.output)
                  : classifyGatewayError(part.error).message;
              const output = capText(raw, STEP_OUTPUT_CHARS);
              step.status = "complete";
              step.output = output.truncated
                ? output
                : { text: output.text };
              if (part.type === "tool-error" || raw.startsWith("Error: ")) {
                step.isError = true;
              }
            }
            publisher.publish({ content: text, activity: activity() }, true);
            break;
          }
          case "finish-step":
            // Text written before a tool call is a response step of its own,
            // so the final bubble reads in the order Ave actually worked.
            if (stepText.trim() !== "" && part.finishReason === "tool-calls") {
              steps.push({
                type: "response",
                label: capText(stepText.trim(), 200).text,
                status: "complete",
              });
            }
            stepText = "";
            break;
          case "error":
            error = describeFailure(classifyGatewayError(part.error));
            break;
          default:
            break;
        }
      }
      if (!stopped && error === undefined) {
        modelMessages = capReplay(await result.responseMessages);
      }
      if (!stopped && error === undefined && steps.length >= MAX_STEPS) {
        text += `\n\n_Stopped after ${MAX_STEPS} steps. Send "continue" to carry on._`;
      }
    } catch (caught) {
      if (!stopped) error = describeFailure(classifyGatewayError(caught));
    }

    await publisher.flush();
    for (const step of steps) step.status = "complete";
    if (stopped && text.trim() === "") text = "Stopped.";
    if (error !== undefined) {
      console.error("[ave] run failed", { threadId, error });
    }
    await ctx.runMutation(internal._ave.run.finishRun, {
      threadId,
      runId,
      content: text,
      activityLog: activity(),
      ...(modelMessages !== undefined ? { modelMessages } : {}),
      ...(error !== undefined ? { error } : {}),
    });
    return null;
  },
});
