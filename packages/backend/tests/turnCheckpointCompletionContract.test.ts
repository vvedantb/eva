import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexDir = join(backendDir, "convex");

function read(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function convexFiles(dir: string = convexDir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "_generated" && entry !== "node_modules") {
        out.push(...convexFiles(full));
      }
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every public (sandbox-callable) mutation whose args carry the completion
 * shape the callback posts (`success` + `activityLog`). Internal mutations are
 * workflow-only and never see the callback payload. The args block is the text
 * between `args: {` and its matching `},` at the same indentation.
 */
function completionReceivers(): { where: string; args: string }[] {
  const receivers: { where: string; args: string }[] = [];
  const header = /export const (\w+) = authMutation\(\{\n  args: \{\n/g;
  for (const file of convexFiles()) {
    const text = read(file);
    for (const match of text.matchAll(header)) {
      const start = match.index + match[0].length;
      const end = text.indexOf("\n  },\n", start);
      const args = text.slice(start, end < 0 ? undefined : end);
      if (
        args.includes("success: v.boolean()") &&
        args.includes("activityLog: v.union(v.string(), v.null())")
      ) {
        receivers.push({
          where: `${relative(convexDir, file)}:${match[1]}`,
          args,
        });
      }
    }
  }
  return receivers;
}

describe("turn checkpoint shas ride on every sandbox completion", () => {
  test("the callback stamps the scalar shas and their multi-repo arrays", () => {
    const stamp = read(
      join(backendDir, "callback-src/runtime/turnCheckpoint.ts"),
    );
    expect(stamp).toContain("args.beforeSha = turnStartSha;");
    expect(stamp).toContain("args.afterSha = afterSha;");
    // Multi-repo sessions also send one `{ path, sha }` per checked-out repo.
    // The scalars stay primary-only alongside them, so a Convex deployment
    // that predates the array fields keeps working.
    expect(stamp).toContain("args.beforeShas = turnStartShas;");
    expect(stamp).toContain("args.afterShas = readAllRepoShas();");
    expect(stamp.match(/args\.\w+ =/g)).toHaveLength(4);
  });

  test("the shared arg shape and the workflow event carry both shas", () => {
    const shapes = read(join(convexDir, "_validators/shapes.ts"));
    expect(shapes).toContain("export const turnCheckpointArgs = {");
    expect(shapes).toContain("beforeSha: v.optional(v.string())");
    expect(shapes).toContain("afterSha: v.optional(v.string())");
    const eventStart = shapes.indexOf("export const workflowCompleteValidator");
    const eventBody = shapes.slice(eventStart, shapes.indexOf("});", eventStart));
    expect(eventBody).toContain("...turnCheckpointArgs");
  });

  test("every sandbox-facing completion receiver accepts the shas", () => {
    // A closed validator rejects the whole callback with
    // ArgumentValidationError and the turn hangs on "Working…" (task 213,
    // 2026-09-02), so the check is over the public receivers the callback
    // bundle can name in COMPLETION_MUTATION / COMPLETE_SYNTHETIC_TURN_MUTATION.
    const receivers = completionReceivers();
    const names = receivers.map(({ where }) => where);
    expect(names).toContain("agentTaskChatWorkflow.ts:handleCompletion");
    expect(names).toContain("projectChatWorkflow.ts:handleCompletion");
    expect(names).toContain("_chat/taskChatDaemon.ts:completeSyntheticTurn");
    expect(names).toContain("_chat/projectChatDaemon.ts:completeSyntheticTurn");
    expect(names).toContain("_sessions/workflow.ts:handleCompletion");
    expect(names).toContain("_taskWorkflow/publicMutations.ts:handleCompletion");
    expect(names.length).toBeGreaterThanOrEqual(15);
    for (const { where, args } of receivers) {
      expect(args, where).toContain("...turnCheckpointArgs");
      expect(args, `${where} duplicates the shared shape`).not.toContain(
        "beforeSha:",
      );
    }
  });
});
