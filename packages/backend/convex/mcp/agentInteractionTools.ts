import { z } from "zod";
import type { FunctionReturnType } from "convex/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  entityAccess,
  entityPath,
  entityRefArgs,
  entitySummary,
  withSelfDefault,
  type EntityKind,
  type EntityRef,
} from "./entityRef";
import {
  errorResult,
  mcpCallAsUser,
  mcpGetContext,
  textResult,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

// Tools for talking to the person behind the agents: an in-app notification
// any caller may raise, and (master only) answering the blocking questions
// child agents are paused on.

/** Whether the caller named a chat at all, as opposed to leaving it blank. */
function namesChat(ref: EntityRef): boolean {
  return (
    ref.id !== undefined || ref.prUrl !== undefined || ref.numId !== undefined
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending question payloads
//
// A pendingQuestions row stores the AskUserQuestion tool input verbatim. The
// web UI (chatBodyUtils.ts) reads the same shape and answers with a JSON map
// of question text -> answer, multi-select joined by ", " (see
// MultipleChoiceQuestion.tsx). Both are reproduced here so an answer from the
// master is indistinguishable from one typed in the UI.
// ─────────────────────────────────────────────────────────────────────────────

const askedQuestionSchema = z.object({
  question: z.string(),
  header: z.string().optional(),
  multiSelect: z.boolean().optional(),
  options: z
    .array(
      z.object({ label: z.string(), description: z.string().optional() }),
    )
    .optional(),
});

type AskedQuestion = z.infer<typeof askedQuestionSchema>;

const askedPayloadSchema = z.object({
  questions: z.array(askedQuestionSchema).min(1),
});

/** How much of an unreadable payload a listing echoes back. */
const UNPARSED_PAYLOAD_LIMIT = 2000;

function parseAskedQuestions(payload: string): AskedQuestion[] | null {
  try {
    const parsed = askedPayloadSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data.questions : null;
  } catch {
    return null;
  }
}

type PendingRow = FunctionReturnType<
  typeof internal.mcp.agentInteractionQueries.listPendingQuestionsForUser
>[number];

function describePendingRow(row: PendingRow) {
  const questions = parseAskedQuestions(row.payload);
  return {
    questionId: row.questionId,
    chat: {
      kind: row.kind,
      id: row.entityId,
      numId: row.numId,
      title: row.title,
      repo: `${row.repoOwner}/${row.repoName}`,
      path: entityPath(row),
    },
    askedAt: new Date(row.createdAt).toISOString(),
    ...(questions
      ? {
          questions: questions.map((q) => ({
            question: q.question,
            header: q.header,
            multiSelect: q.multiSelect === true,
            options: q.options ?? [],
          })),
        }
      : { unparsedPayload: row.payload.slice(0, UNPARSED_PAYLOAD_LIMIT) }),
  };
}

const answerEntrySchema = z.object({
  question: z
    .string()
    .optional()
    .describe(
      "The question text (or its header) as list_pending_questions returned it. Omit to answer the question at the same position as this entry.",
    ),
  options: z
    .array(z.string())
    .optional()
    .describe(
      "Option label(s) to choose, exactly as listed. One for a single-select question; any number for a multiSelect one.",
    ),
  text: z
    .string()
    .optional()
    .describe(
      'Free-text answer, like the UI\'s "Other" field. May be combined with options.',
    ),
});

type AnswerEntry = z.infer<typeof answerEntrySchema>;

function findAskedQuestion(
  questions: AskedQuestion[],
  entry: AnswerEntry,
  position: number,
): AskedQuestion | undefined {
  if (entry.question === undefined) return questions[position];
  const wanted = entry.question.trim().toLowerCase();
  return (
    questions.find((q) => q.question === entry.question) ??
    questions.find((q) => q.question.trim().toLowerCase() === wanted) ??
    questions.find((q) => q.header?.trim().toLowerCase() === wanted)
  );
}

/** One question's answer string, in the shape the UI writes. */
function answerFor(
  question: AskedQuestion,
  entry: AnswerEntry,
): { answer: string } | { error: string } {
  const labels = (question.options ?? []).map((o) => o.label);
  const chosen: string[] = [];
  for (const raw of entry.options ?? []) {
    const wanted = raw.trim().toLowerCase();
    const label = labels.find((l) => l.trim().toLowerCase() === wanted);
    if (label === undefined) {
      return {
        error: `"${raw}" is not an option for "${question.question}". Options: ${labels.join(", ") || "(none — answer with text)"}`,
      };
    }
    if (!chosen.includes(label)) chosen.push(label);
  }
  if (chosen.length > 1 && question.multiSelect !== true) {
    return {
      error: `"${question.question}" takes one option, not ${chosen.length}.`,
    };
  }
  const text = entry.text?.trim();
  const parts = text ? [...chosen, text] : chosen;
  if (parts.length === 0) {
    return {
      error: `Give "${question.question}" an option or some text.`,
    };
  }
  return { answer: parts.join(", ") };
}

/** The full answer map for a question row, or the first thing wrong with it. */
function buildAnswerMap(
  questions: AskedQuestion[],
  entries: AnswerEntry[],
): { answers: Record<string, string> } | { error: string } {
  const answers: Record<string, string> = {};
  for (const [position, entry] of entries.entries()) {
    const question = findAskedQuestion(questions, entry, position);
    if (!question) {
      return {
        error: `No question matches ${entry.question === undefined ? `position ${position + 1}` : `"${entry.question}"`}. Questions: ${questions.map((q) => `"${q.question}"`).join(", ")}`,
      };
    }
    const built = answerFor(question, entry);
    if ("error" in built) return built;
    answers[question.question] = built.answer;
  }
  const missing = questions.filter((q) => answers[q.question] === undefined);
  if (missing.length > 0) {
    return {
      error: `Every question needs an answer, as in the UI. Unanswered: ${missing.map((q) => `"${q.question}"`).join(", ")}`,
    };
  }
  return { answers };
}

const DECISION_RULE =
  "Only answer what the user has already decided, or what is plainly implied by their instructions. Anything that is a genuine user decision — visual or design choices, scope, destructive or irreversible actions, spending money — must be relayed to the user instead (ask them in chat, or notify_user), and answered only once they reply.";

// ─────────────────────────────────────────────────────────────────────────────
// agentInteractionTools — every caller
// ─────────────────────────────────────────────────────────────────────────────

export function agentInteractionTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId } = credentials;
  const { resolveEntityTarget } = entityAccess(ctx, credentials);

  tools.push(
    defineTool({
      name: "notify_user",
      description: `Put a notification in your user's Eva inbox (the bell), linked to a chat so one click opens it. The recipient is always the user this token belongs to.

This is the default way to get the user's attention: something finished, something needs their decision, or you are blocked. Use send_email instead only to hand over a finished result by mail, or when the user asked for email.

urgency "normal" (default) also lands in the user's daily email digest if they have email notifications on; "low" stays in the inbox only, with no digest, toast or chime — use it for FYIs. Keep title and body short; the inbox shows a one-line card.`,
      mutating: true,
      input: {
        title: z
          .string()
          .min(1)
          .max(120)
          .describe("One-line headline, e.g. \"PR #664 is ready to review\"."),
        body: z
          .string()
          .max(500)
          .optional()
          .describe("A sentence or two of detail. Plain text."),
        urgency: z
          .enum(["low", "normal"])
          .default("normal")
          .describe(
            '"normal" (inbox + daily digest) or "low" (inbox only, silent).',
          ),
        ...entityRefArgs,
      },
      handler: async ({ title, body, urgency, ...rawRef }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const ref = withSelfDefault(rawRef, credentials);

        let chat: { kind: EntityKind; id: string } | undefined;
        let linked: ReturnType<typeof entitySummary> | undefined;
        if (namesChat(ref)) {
          const resolved = await resolveEntityTarget(ref, userId);
          if ("isError" in resolved) return resolved;
          chat = { kind: resolved.target.kind, id: resolved.target.targetId };
          linked = entitySummary(resolved.target);
        }

        const notificationId = await ctx.runMutation(
          internal.mcp.agentInteractionQueries.notifyUserFromAgent,
          { userId, title, message: body, urgency, chat },
        );
        return textResult({
          notificationId,
          urgency,
          linkedTo: linked ?? null,
          status: "delivered",
        });
      },
    }),
  );

  return tools;
}

// ─────────────────────────────────────────────────────────────────────────────
// orchestratorQuestionTools — master session only
// ─────────────────────────────────────────────────────────────────────────────

export function orchestratorQuestionTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId } = credentials;
  const { resolveEntityTarget } = entityAccess(ctx, credentials);

  /** Unanswered rows the user can reach, optionally for one chat or one row. */
  async function listPending(args: {
    userId: string;
    entityId?: string;
    questionId?: string;
  }): Promise<PendingRow[]> {
    return ctx.runQuery(
      internal.mcp.agentInteractionQueries.listPendingQuestionsForUser,
      args,
    );
  }

  tools.push(
    defineTool({
      name: "list_pending_questions",
      description: `List the questions your agents are paused on, waiting for the user (an AskUserQuestion that blocks the agent's turn until answered). Covers every chat the user can reach, or one chat if you name it. Each row gives the chat, the questions with their options, whether several options may be picked, when it was asked, and the questionId answer_pending_question takes.

${DECISION_RULE}`,
      mutating: false,
      input: { ...entityRefArgs },
      handler: async (ref) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        let entityId: string | undefined;
        if (namesChat(ref)) {
          const resolved = await resolveEntityTarget(ref, userId);
          if ("isError" in resolved) return resolved;
          entityId = resolved.target.targetId;
        }
        const rows = await listPending({ userId, entityId });
        return textResult({
          pending: rows.map(describePendingRow),
          count: rows.length,
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "answer_pending_question",
      description: `Answer a question an agent is paused on, exactly as if the user had answered it in the chat UI. The agent resumes its turn with the answer. Name the question by questionId (from list_pending_questions), or name the chat and its oldest open question is answered. Every question in the prompt needs an entry.

${DECISION_RULE}`,
      mutating: true,
      input: {
        questionId: z
          .string()
          .optional()
          .describe(
            "The questionId from list_pending_questions. Or name the chat instead with id / prUrl / numId.",
          ),
        answers: z
          .array(answerEntrySchema)
          .min(1)
          .describe(
            "One entry per question in the prompt: the chosen option label(s), free text, or both.",
          ),
        ...entityRefArgs,
      },
      handler: async ({ questionId, answers, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);

        let rows: PendingRow[];
        if (questionId !== undefined) {
          rows = await listPending({ userId, questionId });
        } else if (namesChat(ref)) {
          const resolved = await resolveEntityTarget(ref, userId);
          if ("isError" in resolved) return resolved;
          rows = await listPending({
            userId,
            entityId: resolved.target.targetId,
          });
        } else {
          return errorResult(
            'Name the question: pass "questionId" from list_pending_questions, or the chat\'s "id", "prUrl", or "numId" with "kind" and "repoName".',
          );
        }

        const [row] = rows;
        if (!row) {
          return errorResult(
            "No unanswered question matched, or you do not have access to it. It may already have been answered, or its sandbox stopped.",
          );
        }
        const questions = parseAskedQuestions(row.payload);
        if (!questions) {
          return errorResult(
            "This question is in a shape Eva cannot read, so it cannot be answered here. Ask the user to answer it in the chat.",
          );
        }
        const built = buildAnswerMap(questions, answers);
        if ("error" in built) return errorResult(built.error);

        await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "mutation",
            path: "pendingQuestions:answer",
            args: {
              entityId: row.entityId,
              toolUseId: row.toolUseId,
              answer: JSON.stringify(built.answers),
            },
          },
          z.null(),
        );

        return textResult({
          questionId: row.questionId,
          chat: describePendingRow(row).chat,
          answers: built.answers,
          status: "answered",
        });
      },
    }),
  );

  return tools;
}
