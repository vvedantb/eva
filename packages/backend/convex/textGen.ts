"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { generateText } from "ai";
import { isTitleRegenerating, parseGeneratedTags } from "@eva/shared";
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { getActionRepoWithAccess } from "./functions";
import { isSandboxIdentity } from "./_auth/sandboxIdentity";
import { buildTitleDigest } from "./_sessions/prompts";

/** Cheap gateway model for session titles — one-line change later. */
const TEXT_GEN_MODEL = "openai/gpt-5-nano";

/** Trims, then strips one pair of wrapping quotes the model sometimes adds. */
function stripWrappingQuotes(raw: string): string {
  const text = raw.trim();
  const wrappedDouble = text.startsWith('"') && text.endsWith('"');
  const wrappedSingle = text.startsWith("'") && text.endsWith("'");
  if ((wrappedDouble || wrappedSingle) && text.length >= 2) {
    return text.slice(1, -1).trim();
  }
  return text;
}

/** Strips wrapping quotes the model sometimes adds around the title. */
function cleanGeneratedTitle(raw: string): string {
  return stripWrappingQuotes(raw);
}

/**
 * Generates a short session title from the first user message via AI Gateway.
 * Uses flex service tier (~0.5x cost, higher latency OK — titles are background).
 * Non-fatal: missing key / model errors leave the placeholder title in place.
 * If flex can't be applied, Gateway falls back to default tier/rate (best-effort).
 */
export const generateSessionTitle = internalAction({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const { text } = await generateText({
        model: TEXT_GEN_MODEL,
        prompt: `Generate a concise 3-8 word title for this coding task. Summarize the request, don't restate it. Reply with the title only — no quotes, no trailing punctuation.\n\nTask: ${args.message.slice(0, 2000)}`,
        providerOptions: {
          gateway: {
            serviceTier: "flex",
          },
        },
      });
      const title = cleanGeneratedTitle(text);
      if (!title) {
        return null;
      }
      await ctx.runMutation(internal.sessions.applyGeneratedTitle, {
        sessionId: args.sessionId,
        title,
      });
    } catch (error) {
      console.error("[textGen.generateSessionTitle]", error);
    }
    return null;
  },
});

/**
 * Re-titles a session from its whole conversation, on demand from the session
 * context menu. Unlike `generateSessionTitle` this overwrites a manual title —
 * the user asked for it — and runs while they wait, so failures surface as a
 * toast rather than being swallowed. The in-progress flag is cleared on every
 * exit so a crashed run cannot leave the action disabled.
 */
export const regenerateSessionTitle = action({
  args: { sessionId: v.id("sessions") },
  returns: v.object({ title: v.string() }),
  handler: async (ctx, args): Promise<{ title: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) throw new Error("Not authorized");
    const session = await ctx.runQuery(api.sessions.get, {
      id: args.sessionId,
    });
    if (!session) throw new Error("Not authorized");
    const context = await ctx.runQuery(internal.sessions.getTitleContext, {
      sessionId: args.sessionId,
    });
    if (!context) throw new Error("Session not found");
    await getActionRepoWithAccess(ctx, context.repoId);
    if (isTitleRegenerating(context.titleRegeneration, Date.now())) {
      throw new Error("Title regeneration already running");
    }
    const digest = buildTitleDigest(context.messages);
    if (!digest) throw new Error("Nothing to title yet");

    await ctx.runMutation(internal.sessions.markTitleRegenerating, {
      sessionId: args.sessionId,
      startedAt: Date.now(),
    });
    let title: string;
    try {
      const { text } = await generateText({
        model: TEXT_GEN_MODEL,
        prompt: `Write a new title for this coding session based on the whole conversation below. The title should describe the work the session is about — not claim it is finished. 3-8 words, under 40 characters. Reply with the title only — plain text, no quotes, no trailing punctuation.

Previous title: ${context.title}

Conversation:
${digest}`,
        providerOptions: {
          gateway: {
            serviceTier: "flex",
          },
        },
      });
      title = cleanGeneratedTitle(text);
    } catch (error) {
      await ctx.runMutation(internal.sessions.applyRegeneratedTitle, {
        sessionId: args.sessionId,
        title: undefined,
      });
      throw error;
    }
    await ctx.runMutation(internal.sessions.applyRegeneratedTitle, {
      sessionId: args.sessionId,
      title,
    });
    if (!title) throw new Error("The model returned an empty title");
    return { title };
  },
});

/**
 * Suggests up to three vocabulary tags for a newly created task. Background /
 * flex tier — failures leave the task untagged rather than blocking create.
 */
export const generateTaskTags = internalAction({
  args: {
    taskId: v.id("agentTasks"),
    title: v.string(),
    description: v.optional(v.string()),
    existingTags: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const already =
        args.existingTags.length > 0 ? args.existingTags.join(", ") : "none";
      const description =
        args.description !== undefined && args.description.trim().length > 0
          ? args.description.slice(0, 2000)
          : "(none)";
      const { text } = await generateText({
        model: TEXT_GEN_MODEL,
        prompt: `Pick 0-3 tags that best describe this coding task. Choose only from the list below — never invent a tag. Prefer fewer precise tags over three loose ones. Reply with nothing if none clearly fit.

Type: bug, feature, refactor, docs, testing, chore, migration
Quality: performance, security, accessibility, reliability, design, ux
Area: frontend, backend, database, infra, ci, auth, dependencies, config, integration

Already applied — do not repeat these: ${already}

Reply with the tags on one line, comma separated, no other text.

Title: ${args.title}
Description: ${description}`,
        providerOptions: {
          gateway: {
            serviceTier: "flex",
          },
          openai: {
            reasoningEffort: "minimal",
            textVerbosity: "low",
          },
        },
      });
      const tags = parseGeneratedTags(text, args.existingTags);
      if (tags.length === 0) {
        return null;
      }
      await ctx.runMutation(internal.agentTasks.applyGeneratedTags, {
        taskId: args.taskId,
        tags,
      });
    } catch (error) {
      console.error("[textGen.generateTaskTags]", error);
    }
    return null;
  },
});

/** Longest prefix we send to the model — the tail is what matters, not the head. */
const MAX_COMPLETION_INPUT = 2000;

/** Identical prefixes are common (retyping, undo); an hour of reuse is plenty. */
const COMPLETION_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Trims the model's continuation down to a single clause. The model is asked for
 * one sentence, but it occasionally adds a second or wraps the whole thing in
 * quotes, so clip rather than trust.
 */
function cleanCompletion(raw: string): string {
  const firstLine = raw.split("\n")[0] ?? "";
  let text = firstLine.trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    text = text.slice(1, -1).trim();
  }
  // Keep everything up to and including the first sentence end.
  const sentenceEnd = text.search(/[.!?](\s|$)/);
  if (sentenceEnd !== -1) {
    text = text.slice(0, sentenceEnd + 1);
  }
  return text;
}

/**
 * Uncached inline-completion call — wrapped by ActionCache below. Auth is
 * enforced by the public `completeText` wrapper before `fetch`.
 *
 * Deliberately does NOT use the flex service tier (unlike `generateSessionTitle`):
 * this runs while the user waits, so latency beats cost here.
 */
export const completeTextInternal = internalAction({
  args: {
    text: v.string(),
    /** What the field is for, e.g. "description of a coding task for acme/web". */
    contextHint: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, args): Promise<string> => {
    try {
      const { text } = await generateText({
        model: TEXT_GEN_MODEL,
        prompt: `You are an inline autocomplete for a text field. The field holds: ${args.contextHint}.

Continue the partial text below from exactly where it stops. Reply with the continuation only — do not repeat any of the existing text, do not add quotes, do not explain. Finish the current sentence in at most 15 words. If the text is already complete or you cannot continue it usefully, reply with nothing.

Partial text:
${args.text.slice(-MAX_COMPLETION_INPUT)}`,
        // gpt-5 counts reasoning tokens against maxOutputTokens, so a tight cap
        // returns an empty string. Keep reasoning off and clip in cleanCompletion.
        providerOptions: {
          openai: {
            reasoningEffort: "minimal",
            textVerbosity: "low",
          },
        },
        maxOutputTokens: 256,
        stopSequences: ["\n"],
      });
      return cleanCompletion(text);
    } catch (error) {
      console.error("[textGen.completeTextInternal]", error);
      return "";
    }
  },
});

const completionCache = new ActionCache(components.actionCache, {
  action: internal.textGen.completeTextInternal,
  name: "inlineCompletionV2",
  ttl: COMPLETION_CACHE_TTL_MS,
});

/**
 * Inline "tab to accept" completion for prose composers (quick task description,
 * chat composers). Returns the continuation of `text`, or "" when there is
 * nothing useful to add.
 *
 * Throttling is the client's debounce plus this cache — there is no rate limiter
 * component installed, and identical prefixes cost nothing on repeat.
 */
export const completeText = action({
  args: {
    text: v.string(),
    contextHint: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) throw new Error("Not authorized");
    return await completionCache.fetch(ctx, {
      text: args.text.slice(-MAX_COMPLETION_INPUT),
      contextHint: args.contextHint,
    });
  },
});

/** Transcripts run long; the head is what matters, and 8k chars is minutes of speech. */
const MAX_TRANSCRIPT_INPUT = 8000;

/**
 * Cleans up a raw voice-dictation transcript before it lands in a composer:
 * drops filler words, applies spoken self-corrections, and — only when the
 * transcript rambles across several asks — reshapes it into short bullets.
 *
 * Returns "" on any model failure, which the client reads as "keep the raw
 * transcript"; polish is a nicety and must never lose what the user said.
 * Not cached: transcripts are effectively unique, so a cache buys nothing.
 *
 * Deliberately does NOT use the flex service tier (same reasoning as
 * `completeTextInternal`): the user is waiting on this call.
 */
export const polishTranscript = action({
  args: {
    transcript: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) throw new Error("Not authorized");
    try {
      const { text } = await generateText({
        model: TEXT_GEN_MODEL,
        prompt: `You are cleaning up a raw speech-to-text transcript. The speaker is dictating an instruction to an AI coding agent.

Rewrite the transcript so it reads as if it were typed, following every rule:
1. Remove filler words and disfluencies — "um", "uh", "like", "you know", stutters, and accidentally repeated words.
2. Apply spoken self-corrections. When the speaker changes their mind ("make it blue, actually no, make it green"), keep only the final intent ("make it green") and drop the abandoned one.
3. Preserve the meaning and every concrete detail exactly — file names, identifiers, numbers, quoted strings. Never add information the speaker did not say. Never answer, act on, or expand the instruction. Never drop a distinct request.
4. Match the structure to the input. If the transcript covers several distinct asks or is a long ramble, output short markdown bullet lines ("- " prefixed), one per ask. If it is a single short request, output one or two clean sentences with no bullets.
5. If the transcript is already clean, return it essentially unchanged.
6. Reply with the polished text only — no preamble, no quotes, no explanation.

Transcript:
${args.transcript.slice(0, MAX_TRANSCRIPT_INPUT)}`,
        // gpt-5 counts reasoning tokens against maxOutputTokens, and the output
        // roughly mirrors the input length, so keep reasoning off and the cap high.
        providerOptions: {
          openai: {
            reasoningEffort: "minimal",
            textVerbosity: "low",
          },
        },
        maxOutputTokens: 2048,
      });
      return stripWrappingQuotes(text);
    } catch (error) {
      console.error("[textGen.polishTranscript]", error);
      return "";
    }
  },
});
