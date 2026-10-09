import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

function readSource(relative: string): string {
  return readFileSync(join(convexDir, relative), "utf8");
}

const nodeActions = readSource("mcp/nodeActions.ts");
const queueHelpers = readSource("_queues/helpers.ts");
const sessionExecution = readSource("_sessions/execution.ts");
const taskChat = readSource("agentTaskChatWorkflow.ts");
const sessionMutations = readSource("_sessions/mutations.ts");
const tableFields = readSource("_validators/tableFields.ts");

/**
 * A message the orchestrator sends is marked so the child's chat can badge it
 * "via orchestrator". The flag has to survive the *queued* path too: a busy
 * child parks the message in `queuedMessages`, and the drain inserts the user
 * row from that queued document — so a missing field anywhere in the chain
 * silently drops the badge on exactly the messages that had to wait.
 */
describe("sentViaOrchestrator survives queueing", () => {
  test("the queued row can carry it", () => {
    const queuedFields = tableFields.slice(
      tableFields.indexOf("export const queuedMessageFields = {"),
    );
    expect(queuedFields).toContain(
      "sentViaOrchestrator: v.optional(v.boolean())",
    );
  });

  test("both enqueue mutations accept and persist it", () => {
    for (const source of [sessionExecution, taskChat]) {
      expect(source).toContain("sentViaOrchestrator: v.optional(v.boolean())");
    }
    expect(taskChat).toContain("sentViaOrchestrator: args.sentViaOrchestrator");
    // Session chats enqueue through one shared helper: the mutation threads
    // the flag into it and the helper writes it onto the queued row.
    const enqueue = sessionExecution.slice(
      sessionExecution.indexOf("export const enqueueMessage ="),
    );
    expect(enqueue).toContain("sentViaOrchestrator,\n      ...settings");
    expect(enqueue).toContain("enqueueChatMessage(ctx, {");
    expect(enqueue).toContain("sentViaOrchestrator,\n    });");
    const helper = sessionExecution.slice(
      sessionExecution.indexOf("async function enqueueChatMessage("),
      sessionExecution.indexOf("export const retryEmptyStalledSessionTurn ="),
    );
    expect(helper).toContain('ctx.db.insert("queuedMessages"');
    expect(helper).toContain(
      "sentViaOrchestrator: params.sentViaOrchestrator",
    );
  });

  test("both drains copy it onto the started user message", () => {
    // Session and task chat each build their own `messages` insert.
    const copies = queueHelpers.match(
      /sentViaOrchestrator: next\.sentViaOrchestrator/g,
    );
    expect(copies?.length).toBe(2);
  });

  test("the tool sets it on every delivery path", () => {
    // Idle and busy paths for all three chat surfaces now come from one
    // builder, so the flag is threaded into it rather than repeated per call.
    // `create_session` is the only place nodeActions still hard-codes it.
    expect(nodeActions).toContain("buildChatMessageCalls({");
    expect(nodeActions).toContain("sentViaOrchestrator,");
    expect(nodeActions).toContain("sentViaOrchestrator: true");
    const delivery = readSource("mcp/orchestratorDelivery.ts");
    const badges = delivery.match(/orchestratorBadge: true/g);
    expect(badges?.length).toBe(2);
  });

  test("a session the orchestrator creates marks its first message", () => {
    expect(sessionMutations).toContain(
      "sentViaOrchestrator: args.sentViaOrchestrator",
    );
  });
});

/**
 * Delivery must treat a queue backlog as busy. A session created by
 * `create_session` parks its first turn in `queuedMessages` until its sandbox
 * reports ready — no workflow is in flight yet — so deciding "idle" from
 * `activeWorkflowId` alone made a follow-up run *ahead* of that first message.
 */
describe("queued work counts as busy", () => {
  test("send reads the child's queue depth", () => {
    expect(nodeActions).toContain('"queuedMessages:listByParent"');
    expect(nodeActions).toContain("const queuedAhead");
  });

  test("every chat surface folds it into isBusy", () => {
    // One fold, read by session, quick task chat and project chat alike.
    expect(nodeActions.match(/queuedAhead > 0/g)?.length).toBe(1);
    expect(nodeActions).toContain("const isBusy = isExecuting || queuedAhead > 0;");
    const delivery = nodeActions.slice(
      nodeActions.indexOf("function chatDelivery("),
      nodeActions.indexOf("export const orchestratorSendMessage"),
    );
    expect(delivery.match(/^\s+isBusy,$/gm)?.length).toBe(3);
  });
});

/**
 * `list_agents` runs every supervision round. It keeps eleven small fields per
 * task, but used to fetch whole `agentTasks` documents to get them — measured on
 * real data at 115KB per call across 43 active tasks, worst single document
 * 38.6KB (`backgroundAgents`, `description`), all discarded. The slim
 * projection cut that to 13KB.
 */
describe("the fleet list does not fetch whole task documents", () => {
  const taskQueries = readSource("_agentTasks/queries.ts");

  test("the slim projection exists and is what the tool calls", () => {
    expect(taskQueries).toContain("export const getActiveTasksSlim");
    expect(nodeActions).toContain('"_agentTasks/queries:getActiveTasksSlim"');
  });

  test("the fleet list no longer calls the full-document query", () => {
    expect(nodeActions).not.toContain('"_agentTasks/queries:getActiveTasks"');
  });

  test("the projection omits the fields that made docs large", () => {
    const projection = taskQueries.slice(
      taskQueries.indexOf("const orchestratorTaskValidator"),
      taskQueries.indexOf("export const getAllTasks"),
    );
    for (const fat of [
      "backgroundAgents",
      "description",
      "terminalHistoryTail",
      "terminalPanes",
      "pendingTurn",
    ]) {
      expect(projection).not.toContain(fat);
    }
  });

  test("both task queries share one scope implementation", () => {
    // Team repos + connected repos + active statuses, defined once.
    expect(taskQueries).toContain("async function activeTasksForUser");
    const uses = taskQueries.match(/activeTasksForUser\(ctx, ctx\.userId/g);
    expect(uses?.length).toBe(2);
  });
});
