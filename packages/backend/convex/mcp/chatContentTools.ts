import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import type { JsonValue } from "../_jev/jsonValue";
import {
  entityAccess,
  entityRefArgs,
  entitySummary,
  withSelfDefault,
  type EntityTarget,
} from "./entityRef";
import {
  confirmedDeleteArg,
  errorResult,
  mcpCallAsUser,
  mcpGetContext,
  textResult,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

/** The chat arg `chatLog:*` takes, from a resolved target. */
function chatSourceArg(target: EntityTarget): { [key: string]: JsonValue } {
  if (target.kind === "session") {
    return { kind: "session", sessionId: target.targetId };
  }
  if (target.kind === "task") return { kind: "task", taskId: target.targetId };
  return { kind: "project", projectId: target.targetId };
}

/** Every public mutation below returns `null`; parsed so a drift is loud. */
const nullReply = z.null();

/** Public function that renames each surface. All three take `{ id, title }`. */
const RENAME_PATH = {
  session: "sessions:update",
  task: "agentTasks:update",
  project: "projects:update",
};

const proposedPlanRow = z.object({
  _id: z.string(),
  planMarkdown: z.string(),
  implementedAt: z.number().optional(),
  createdAt: z.number(),
});

const taskCommentRow = z.object({
  _id: z.string(),
  content: z.string(),
  authorId: z.string().optional(),
  parentId: z.string().optional(),
  deletedAt: z.number().optional(),
  createdAt: z.number(),
});

/**
 * Tools that edit what a chat holds rather than how it runs: its title, its
 * Plan tab, its quick task comments, and the artifacts and docs it produced.
 *
 * Every write goes through the same public Convex function the web UI calls,
 * as the MCP caller (mcpCallAsUser), so the UI's own access checks apply.
 */
export function chatContentTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId } = credentials;
  const { resolveEntityTarget } = entityAccess(ctx, credentials);

  // ───────────────────────────────────────────────────────────────────────────
  // delete_artifact / delete_eva_doc
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "delete_artifact",
      description: `Delete a saved Eva artifact: its hosted HTML and its row. This cannot be undone, and the artifact's viewUrl stops working for everyone on the team.

Ask the user in chat before calling, and pass confirmed: true only after they say yes. Any member of the artifact's team may delete it. The reply echoes the id with status "deleted".`,
      mutating: true,
      input: {
        artifactId: z
          .string()
          .describe("The artifact ID (from create_artifact or list_artifacts)"),
        confirmed: confirmedDeleteArg,
      },
      handler: async ({ artifactId }) => {
        await mcpGetContext(ctx, clerkUserId);
        await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "mutation",
            path: "artifacts:remove",
            args: { id: artifactId },
          },
          nullReply,
        );
        return textResult({ artifactId, status: "deleted" });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "delete_eva_doc",
      description: `Delete an Eva design document (PRD). It disappears from the repo's Documents list and from any chat's Documents tab.

Ask the user in chat before calling, and pass confirmed: true only after they say yes. You need access to the doc's repo. The reply echoes the id with status "deleted".`,
      mutating: true,
      input: {
        docId: z
          .string()
          .describe("The Eva doc ID (from create_eva_doc or list_eva_docs)"),
        confirmed: confirmedDeleteArg,
      },
      handler: async ({ docId }) => {
        await mcpGetContext(ctx, clerkUserId);
        await mcpCallAsUser(
          ctx,
          clerkUserId,
          { type: "mutation", path: "docs:remove", args: { id: docId } },
          nullReply,
        );
        return textResult({ docId, status: "deleted" });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // rename_chat
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "rename_chat",
      description: `Rename a session, quick task or project. Name no chat and it renames the one you are running in.

Pass "title" to set it, or "regenerate": true (sessions only) to have Eva write a new title from the whole conversation. A session that has opened a PR also renames that PR on GitHub to match.

The reply is the chat's identity with the title it now has.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        title: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe("The new title. Omit only when regenerate is true."),
        regenerate: z
          .boolean()
          .optional()
          .describe(
            "Sessions only: let Eva write a new title from the conversation instead of passing one. Fails if a regeneration is already running or the session has no messages yet.",
          ),
      },
      handler: async ({ title, regenerate, ...ref }) => {
        const wantsRegenerate = regenerate === true;
        if (wantsRegenerate === (title !== undefined)) {
          return errorResult('Pass exactly one of "title" or "regenerate".');
        }

        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;

        if (title === undefined) {
          if (target.kind !== "session") {
            return errorResult(
              'regenerate only works on sessions. Pass "title" to rename a quick task or project.',
            );
          }
          const generated = await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "action",
              path: "textGen:regenerateSessionTitle",
              args: { sessionId: target.targetId },
            },
            z.object({ title: z.string() }),
          );
          return textResult({
            ...entitySummary(target),
            title: generated.title,
            status: "renamed",
          });
        }

        await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "mutation",
            path: RENAME_PATH[target.kind],
            args: { id: target.targetId, title },
          },
          nullReply,
        );
        return textResult({
          ...entitySummary(target),
          title,
          status: "renamed",
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // update_plan / mark_plan_implemented
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "update_plan",
      description: `Replace the Plan tab of a session with new markdown. Name no chat and it writes the plan of the session you are running in.

Sessions only: quick tasks and projects have no Plan tab. The whole plan is replaced, so pass the full text, not a diff. This does not create a proposed-plan card in the chat.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        planContent: z
          .string()
          .describe("The full plan as markdown. Replaces what is there."),
      },
      handler: async ({ planContent, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        if (target.kind !== "session") {
          return errorResult(
            "Only sessions have a Plan tab. Quick tasks and projects keep their plan in the description or spec.",
          );
        }

        await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "mutation",
            path: "sessions:updatePlanContent",
            args: { id: target.targetId, planContent },
          },
          nullReply,
        );
        return textResult({
          ...entitySummary(target),
          planLength: planContent.length,
          status: "updated",
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "mark_plan_implemented",
      description: `Mark a session's proposed plan (the card an ExitPlanMode plan leaves in chat) as implemented. Name no chat and it acts on the session you are running in.

Pass "planId" to pick one; omit it to mark the newest plan not yet implemented. Sessions only. The reply names the plan marked, or says there was none open.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        planId: z
          .string()
          .optional()
          .describe(
            "The proposed plan to mark. Omit to mark the newest plan not yet implemented.",
          ),
        implementationSessionId: z
          .string()
          .optional()
          .describe(
            "The session that carried the plan out, if not the one that proposed it.",
          ),
      },
      handler: async ({ planId, implementationSessionId, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        if (target.kind !== "session") {
          return errorResult("Only sessions have proposed plans.");
        }

        const plans = await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "query",
            path: "proposedPlans:listBySession",
            args: { sessionId: target.targetId },
          },
          z.array(proposedPlanRow),
        );
        const plan =
          planId !== undefined
            ? plans.find((row) => row._id === planId)
            : plans
                .filter((row) => row.implementedAt === undefined)
                .sort((a, b) => b.createdAt - a.createdAt)[0];
        if (plan === undefined) {
          return errorResult(
            planId !== undefined
              ? "That plan does not belong to this session."
              : "This session has no proposed plan waiting to be implemented.",
          );
        }

        await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "mutation",
            path: "proposedPlans:markImplemented",
            args:
              implementationSessionId !== undefined
                ? { planId: plan._id, implementationSessionId }
                : { planId: plan._id },
          },
          nullReply,
        );
        return textResult({
          ...entitySummary(target),
          planId: plan._id,
          status: "implemented",
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // add_task_comment / list_task_comments
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "add_task_comment",
      description: `Post a comment on a quick task or project task, as you (the user this token belongs to). Name no chat and it comments on the task you are running in.

Comments notify the task's subscribers and anyone @mentioned, exactly as a comment typed in Eva does. It does not re-run the task. Pass "parentId" to reply in a thread. The reply carries the new commentId.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        content: z.string().min(1).describe("The comment body, as markdown."),
        parentId: z
          .string()
          .optional()
          .describe(
            "Comment to reply to (from list_task_comments). Omit for a top-level comment.",
          ),
      },
      handler: async ({ content, parentId, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        if (target.kind !== "task") {
          return errorResult(
            'Comments live on tasks only. Name a task (kind "task").',
          );
        }

        const commentId = await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "mutation",
            path: "taskComments:create",
            args:
              parentId !== undefined
                ? { taskId: target.targetId, content, parentId }
                : { taskId: target.targetId, content },
          },
          z.string(),
        );
        return textResult({
          ...entitySummary(target),
          commentId,
          status: "posted",
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "list_task_comments",
      description: `List every comment on a quick task or project task, oldest first. Name no chat and it lists the task you are running in.

Each row has its id, content, authorId, parentId (set on replies) and createdAt. Deleted comments stay in the list with placeholder text and a deletedAt.`,
      mutating: false,
      input: entityRefArgs,
      handler: async (ref) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        if (target.kind !== "task") {
          return errorResult(
            'Comments live on tasks only. Name a task (kind "task").',
          );
        }

        const rows = await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "query",
            path: "taskComments:listByTask",
            args: { taskId: target.targetId },
          },
          z.array(taskCommentRow),
        );
        const comments = rows.map((row) => ({
          id: row._id,
          content: row.content,
          authorId: row.authorId,
          parentId: row.parentId,
          createdAt: row.createdAt,
          deletedAt: row.deletedAt,
        }));
        return textResult({
          ...entitySummary(target),
          comments,
          count: comments.length,
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // log_entry / read_chat_log
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "log_entry",
      description: `Add one entry to a chat's Log, shown at the top of its Documents tab. Name no chat and it writes to the chat you are running in.

The Log is append-only: it is how the user catches up on this chat weeks later. Log decisions (with the reason), research findings and changes, in user terms. To change an earlier decision, add a new decision and pass the old entry's id as "supersedes". The reply carries the new entry's id.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        entryKind: z
          .enum(["decision", "research", "change", "note"])
          .describe(
            '"decision": a settled choice. "research": a finding that shaped the work. "change": what was built or changed. "note": anything else worth keeping.',
          ),
        title: z
          .string()
          .min(1)
          .max(200)
          .describe("One short sentence a reader can scan."),
        body: z
          .string()
          .max(4000)
          .optional()
          .describe(
            "Markdown detail: the reason for a decision, the evidence for a finding.",
          ),
        supersedes: z
          .string()
          .optional()
          .describe(
            "Id of the earlier entry (from read_chat_log) that this decision replaces.",
          ),
      },
      handler: async ({ entryKind, title, body, supersedes, ...ref }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        const entryId = await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "mutation",
            path: "chatLog:append",
            args: {
              source: chatSourceArg(target),
              kind: entryKind,
              author: "agent",
              title,
              ...(body !== undefined ? { body } : {}),
              ...(supersedes !== undefined ? { supersedesId: supersedes } : {}),
            },
          },
          z.string(),
        );
        return textResult({
          ...entitySummary(target),
          entryId,
          status: "logged",
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "read_chat_log",
      description: `Read a chat's Log as markdown: current decisions, then every entry by day. Name no chat and it reads the chat you are running in. Use it to catch up on what was agreed earlier, or to find the id of a decision to supersede (ids are listed after the markdown).`,
      mutating: false,
      input: { ...entityRefArgs },
      handler: async (ref) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const resolved = await resolveEntityTarget(
          withSelfDefault(ref, credentials),
          userId,
        );
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        const source = chatSourceArg(target);
        const [markdown, rows] = await Promise.all([
          mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "query",
              path: "chatLog:markdownForSource",
              args: { source },
            },
            z.string(),
          ),
          mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "query",
              path: "chatLog:listForSource",
              args: { source },
            },
            z.array(
              z
                .object({ _id: z.string(), kind: z.string(), title: z.string() })
                .passthrough(),
            ),
          ),
        ]);
        return textResult({
          ...entitySummary(target),
          markdown,
          entries: rows.map((row) => ({
            id: row._id,
            kind: row.kind,
            title: row.title,
          })),
        });
      },
    }),
  );

  return tools;
}
