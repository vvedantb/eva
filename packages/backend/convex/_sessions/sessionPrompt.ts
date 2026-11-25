import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { entityVisible } from "../numId";
import { resolveSessionBaseBranch } from "./baseBranch";
import { buildEditPrompt, chatSystemPrompt } from "./prompts";
import { resolveMessageTokens } from "../_mentions/resolveMessageTokens";
import { bareHarnessCommandPrompt } from "../_mentions/bareHarnessCommand";
import { resolveExperimentalFlags } from "../_auth/experimentalFlags";
import { buildCustomInstructionsBlock } from "../prompts";
import { listReadableSiblingRepos } from "../_githubRepos/sandboxRead";
import {
  detectModelHandoffFromMessages,
  hasDeliveredTurn,
  prependModelHandoffContext,
  readHandoffHistory,
} from "../_shared/modelHandoff";
import { listLiveSessionChats } from "../_sessionChats/helpers";
import { buildSessionBranchName } from "../_git/branchNames";
import { sandboxOwnerKey } from "@eva/shared";
import { taskPrUrl } from "../_pullRequests/store";
import { sessionOwner } from "./owner";
import {
  formatProjectTaskTable,
  loadProjectTaskRows,
} from "../_projects/taskTable";

// --- Turn config ---

/**
 * Tools every session turn may use. Skill is required so the harness can invoke
 * Eva's system skills (eva-plan, eva-design, eva-ask, eva-capture, eva-audit, eva-grab-proof,
 * eva-resolve-conflicts), which is
 * how planning and design work now that turn modes are gone.
 */
export const SESSION_TOOLS = "Read,Write,Edit,Bash,Glob,Grep,Skill";

/**
 * Added to a turn's prompt while the session has more than one open chat.
 * Deliberately not a sibling summary (what the other chats are doing) — only
 * the one fact an agent sharing a working tree needs.
 */
const PARALLEL_CHATS_NOTE =
  "Other chats in this session may edit this checkout at the same time. Do not revert changes you did not make.";

type TaskContextFields = Pick<
  Doc<"agentTasks">,
  "title" | "description" | "tags" | "taskNumber"
> & { status: string };

/**
 * The owner-context line a quick task's chat turn leads with: which task this
 * sandbox serves, its status, tags and description.
 */
export function withTaskContext(
  task: TaskContextFields,
  message: string,
): string {
  const numberLabel = task.taskNumber ? `#${task.taskNumber} ` : "";
  const descriptionBlock = task.description
    ? `\nTask description:\n${task.description}`
    : "";
  const tagsLine =
    task.tags && task.tags.length > 0 ? `\nTags: ${task.tags.join(", ")}` : "";
  return `In the sandbox for task ${numberLabel}"${task.title}" (status: ${task.status})${tagsLine}${descriptionBlock}

${message}`;
}

/**
 * Longest part of the project summary doc a turn's prompt carries. The agent
 * reads the rest with `get_eva_doc`.
 */
export const PROJECT_SUMMARY_PROMPT_MAX_CHARS = 6_000;

/** Joins the non-empty prompt blocks with a blank line. */
function joinBlocks(...blocks: string[]): string {
  return blocks.filter((block) => block.trim() !== "").join("\n\n");
}

/**
 * What every coordinator and child task turn knows of its project: the
 * project context (its description) and the summary doc, capped at
 * `PROJECT_SUMMARY_PROMPT_MAX_CHARS`. Empty when neither is set.
 */
async function projectBriefBlock(
  ctx: QueryCtx,
  project: Pick<Doc<"projects">, "description" | "summaryDocId">,
): Promise<string> {
  const summary = project.summaryDocId
    ? entityVisible(await ctx.db.get(project.summaryDocId))
    : null;
  const text = summary?.content.trim() ?? "";
  const max = PROJECT_SUMMARY_PROMPT_MAX_CHARS;
  const summaryBlock =
    summary && text
      ? `Project summary (Eva doc ${summary._id}; it can be out of date):\n${
          text.length > max
            ? `${text.slice(0, max)}\n[Cut at ${max} characters. Read the whole doc with get_eva_doc.]`
            : text
        }`
      : "";
  const context = project.description?.trim();
  return joinBlocks(
    context ? `Project context:\n${context}` : "",
    summaryBlock,
  );
}

/** What a child task knows of its place in the project and how it reports up. */
const CHILD_TASK_RULES = `This task is one part of a project. The project's coordinator plans the work and other tasks run beside this one, each on its own branch and PR to main.
- Do only this task. Keep your change safe to merge alone.
- Read sibling tasks, docs and the summary with list_agents (scope "project"), list_eva_docs and list_artifacts (scope "project") and read_chat_log. Never change a sibling's work.
- report_to_coordinator with kind "report" tells the coordinator something other tasks need (for example a changed API). Keep working after it.
- report_to_coordinator with kind "ask" asks a question you cannot answer yourself. After an ask, stop and end your turn: the answer starts your next run.
- If main moved and your branch conflicts, rebase and fix the conflicts yourself.`;

/**
 * The project half of a child task's prompt: its place in the project and
 * the project brief (`projectBriefBlock`). A snapshot when
 * the turn or run starts. Shared by the task's chat turns (`ownerPromptContext`)
 * and its runs (`taskWorkflow.getTaskData`).
 */
export async function childTaskProjectBlock(
  ctx: QueryCtx,
  project: Pick<Doc<"projects">, "title" | "description" | "summaryDocId">,
): Promise<string> {
  return joinBlocks(
    `This task is part of project "${project.title}".`,
    CHILD_TASK_RULES,
    await projectBriefBlock(ctx, project),
  );
}

/** How a coordinator works; leads every coordinator turn. */
export const COORDINATOR_RULES = `You are this project's coordinator. You plan the project and keep it moving; child tasks do the work.
- Never edit, commit or push code. Your sandbox is read-only: read code to plan, nothing more.
- Reply like a teammate in a chat: 1-3 short lines in plain words. No headings. Use a list only when you list tasks.
- Split work into child tasks with create_tasks_batch (or create_task): one repo each, a short title, a full description and a phase label. Split by files, so tasks running at the same time do not touch the same code. When two tasks must touch the same area, create the second only after the first is merged.
- Group work before you create tasks. When a person sends many items (a feedback list, review notes), sort them by area first. Put related small items in one task, so each task is one PR for one area (for example "Checkout copy fixes: 6 items"). Give a large or risky item its own task. List every item in the task description, so none is lost.
- Route new items to an existing task when one already covers that area and its PR is not merged: send them to that task with send_chat_message instead of creating a new task. Create a new task only when no open task fits.
- After you sort a batch, reply with each item and where it went (which task, or why you left it out).
- A task runs in the project's home repo by default. Give it another repo (repoName) when the work needs it or the person asks; any repo the person can access is allowed.
- Plan each task so its PR is safe to merge alone, or put the work behind a flag. If the repo has no flag method, ask the person.
- Tasks you create start at once: the scheduler starts them all, in task-number order. Create them in the order they should run.
- Tasks people add wait in Triage until a person approves them. You cannot approve them; read them and plan around them.
- Messages between people that @mention someone else are not for you; leave them to that person. When a message @mentions you and others, answer only your part.
- A running task does not see your summary updates. If it must know something now, message it with send_chat_message.
- Answer a task's question with send_chat_message to that task. If you cannot, say so in this chat so a person answers.
- A failed task: read its state with get_agent_state, then retry it once with retry_task and a note on what to change, or tell the person.
- Keep the project summary current with update_project_summary: goal, launched, in progress, next, decisions, risks.`;

/**
 * What the session's owner adds to a turn. A standalone session adds nothing.
 * A task's session leads with the task; a project child task's also carries
 * the project (`childTaskProjectBlock`). A project's session is its
 * coordinator: it leads with the coordinator rules, the project brief and the
 * live task table (`formatProjectTaskTable`). This is a snapshot when the
 * turn starts. The owner's PR is used: the owner owns it, the session has
 * none.
 */
async function ownerPromptContext(
  ctx: QueryCtx,
  session: Doc<"sessions">,
  message: string,
): Promise<{ message: string; planContent?: string; prUrl?: string }> {
  const owner = sessionOwner(session);
  const taskId = owner.kind === "task" ? owner.taskId : undefined;
  const task = taskId ? await ctx.db.get(taskId) : null;
  if (task) {
    const project = task.projectId ? await ctx.db.get(task.projectId) : null;
    return {
      message: project
        ? joinBlocks(
            await childTaskProjectBlock(ctx, project),
            withTaskContext(task, message),
          )
        : withTaskContext(task, message),
      planContent: task.description,
      prUrl: taskPrUrl(task),
    };
  }
  const projectId = owner.kind === "project" ? owner.projectId : undefined;
  const project = projectId ? await ctx.db.get(projectId) : null;
  if (project) {
    return {
      message: joinBlocks(
        `In the sandbox for project "${project.title}".`,
        COORDINATOR_RULES,
        await projectBriefBlock(ctx, project),
        formatProjectTaskTable(
          await loadProjectTaskRows(ctx.db, project, session.userId),
        ),
        message,
      ),
      prUrl: project.prUrl,
    };
  }
  return { message, prUrl: session.prUrl };
}

/**
 * Builds the agent prompt for a chat turn (doc `@` mentions resolved, custom
 * instructions + system prompt folded in). Shared single source of truth so
 * both the workflow's `getSessionData` query and the daemon-pull `startExecute`
 * mutation produce byte-identical prompts — the daemon must run exactly what
 * the workflow would have handed it, never a second variant. Takes
 * already-fetched session/chat/repo/user docs so it works from either a query
 * or a mutation context (MutationCtx satisfies QueryCtx for the read-only
 * mention resolution).
 */
export async function buildSessionPrompt(
  ctx: QueryCtx,
  args: {
    session: Doc<"sessions">;
    chat: Doc<"sessionChats">;
    repo: Doc<"githubRepos">;
    user: Doc<"users"> | null;
    message: string;
    /** Model this turn runs on; decides whether a handoff catch-up is needed. */
    model: string;
  },
): Promise<{ prompt: string; branchName: string }> {
  const { session, chat, repo, user } = args;
  const [liveChats, { resolvedMessage, prefixBlock }] = await Promise.all([
    listLiveSessionChats(ctx.db, session._id),
    resolveMessageTokens(ctx, args.message, session.repoId),
  ]);
  const parallelNote =
    liveChats.length > 1 ? `\n\n${PARALLEL_CHATS_NOTE}` : "";
  const rootDirectory = repo.rootDirectory ?? "";
  const customInstructionsBlock = buildCustomInstructionsBlock(
    user?.role ?? undefined,
    user?.customInstructions ?? undefined,
  );

  const branchName = session.branchName || buildSessionBranchName(session._id);

  const bareCommand = bareHarnessCommandPrompt(resolvedMessage, args.model);
  if (bareCommand !== null) return { prompt: bareCommand, branchName };

  // Sibling repositories this sandbox's git credentials can read (owner is the
  // session owner, whose access the credential helper mints tokens against).
  // Cursor resumes the saved SDK agent; the Eva transcript is not stuffed
  // in as a rotation handoff. Session plan.md / planContent is not injected —
  // that was the old Plan/Build mode contract.
  const [readableRepos, linkedRepoRows, owner, history] = await Promise.all([
    listReadableSiblingRepos(ctx.db, session.userId, repo._id),
    ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect(),
    ownerPromptContext(ctx, session, resolvedMessage),
    readHandoffHistory(ctx, chat._id),
  ]);
  const handoff = detectModelHandoffFromMessages(
    history,
    args.model,
    chat.provider,
  );
  // A resumed provider session already holds the full instructions from an
  // earlier turn. Re-sending ~3k tokens each message only slows the reply.
  const followUp = handoff.kind === "none" && hasDeliveredTurn(history);
  const linkedRepos = linkedRepoRows.map((row) => ({
    owner: row.owner,
    name: row.name,
    path: row.path,
    branchName: row.branchName,
    baseBranch: row.baseBranch,
  }));
  let prompt = buildEditPrompt({
    repo: {
      owner: repo.owner,
      name: repo.name,
      baseBranch: resolveSessionBaseBranch(session, repo),
    },
    branchName,
    message: owner.message,
    planContent: owner.planContent,
    rootDirectory,
    customInstructionsBlock,
    systemPrompt: repo.systemPrompt,
    devPort: session.devPort ?? repo.devPort,
    readableRepos,
    linkedRepos,
    followUp,
    staticInSystemPrompt: chatSystemPrompt(args.model) !== undefined,
    runtime: {
      ownerKey: sandboxOwnerKey({ kind: "session", sessionId: session._id }),
      prUrl: owner.prUrl,
      devCommand: session.devCommand ?? repo.devCommand,
      startupCommands: repo.startupCommands,
      backgroundCommands: repo.backgroundCommands,
      agentMemoryEnabled: repo.agentMemoryEnabled,
      askTeammatesEnabled: resolveExperimentalFlags(user).askTeammates,
      prWatchEnabled: resolveExperimentalFlags(user).prWatch,
    },
  });
  prompt = `${prompt}${parallelNote}`;
  if (prefixBlock) {
    prompt = `${prefixBlock}\n\n${prompt}`;
  }
  // Last, so the catch-up block leads the whole prompt.
  prompt = await prependModelHandoffContext(ctx, chat._id, handoff, prompt);
  return { prompt, branchName };
}
