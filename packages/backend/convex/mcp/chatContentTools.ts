import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { entityAccess, entityRefArgs, entitySummary } from "./entityRef";
import {
  confirmedDeleteArg,
  errorResult,
  mcpCallAsUser,
  mcpGetContext,
  textResult,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

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
  const { resolveChat } = entityAccess(ctx, credentials);

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

        const resolved = await resolveChat(ref);
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
        const resolved = await resolveChat(ref);
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
        const resolved = await resolveChat(ref);
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
        const resolved = await resolveChat(ref);
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
        const resolved = await resolveChat(ref);
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

  return tools;
}
