"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { encryptValue } from "./encryption";
import { assertActionTeamAccess, getActionRepoWithAccess } from "./functions";
import { getSandboxHandle } from "./_sandbox_runtime/helpers";
import { EVA_ENV_FILE, renderEvaEnvFile } from "./_sandbox/vercelEnvFile";
import { savedReply } from "./_envVarRequests/replies";

/**
 * Appends the var to the running sandbox's env file, so the agent's next shell
 * has it without a restart. The value goes in through `writeFile`, never on an
 * exec command line, and the temp file is removed in the same exec. A later
 * `export` wins when the file is sourced, so appending also replaces. False
 * when the VM is not running: `getSandboxHandle` never wakes it, and the next
 * start writes the file from the stored vars anyway.
 */
async function writeLive(
  ctx: ActionCtx,
  request: Doc<"envVarRequests">,
  value: string,
): Promise<boolean> {
  if (request.sandboxId === undefined) return false;
  const handle = await getSandboxHandle(ctx, request.repoId, request.sandboxId);
  if (handle.state !== "running") return false;
  const tmp = `/tmp/eva-env-${randomUUID()}.sh`;
  await handle.writeFile(tmp, renderEvaEnvFile({ [request.key]: value }));
  const result = await handle.exec(
    `cat ${tmp} >> ${EVA_ENV_FILE}; status=$?; rm -f ${tmp}; exit $status`,
    { cwd: "/", timeoutSeconds: 15 },
  );
  return result.exitCode === 0;
}

/**
 * Saves the secret a user typed into a request card: encrypted into the repo
 * or team env vars, then into the live sandbox. Returns the message to post to
 * the agent; it names the key, never the value.
 */
export const save = action({
  args: { requestId: v.id("envVarRequests"), value: v.string() },
  returns: v.object({ reply: v.string() }),
  handler: async (ctx, args): Promise<{ reply: string }> => {
    const value = args.value.trim();
    if (value.length === 0) throw new Error("Enter a value.");
    const request: Doc<"envVarRequests"> | null = await ctx.runQuery(
      api.envVarRequests.getForAnswer,
      {
        requestId: args.requestId,
      },
    );
    if (!request) throw new Error("This request no longer exists.");
    if (request.status !== "pending") {
      throw new Error("This request was already answered.");
    }

    const stored = encryptValue(value);
    if (request.scope === "team") {
      if (request.teamId === undefined) {
        throw new Error("This repo has no team to save the variable on.");
      }
      await assertActionTeamAccess(ctx, request.teamId);
      await ctx.runMutation(internal.teamEnvVars.upsertVarInternal, {
        teamId: request.teamId,
        key: request.key,
        value: stored,
      });
    } else {
      await getActionRepoWithAccess(ctx, request.repoId);
      await ctx.runMutation(internal.repoEnvVars.upsertVarInternal, {
        repoId: request.repoId,
        key: request.key,
        value: stored,
      });
    }

    // Stored is what matters; a failed live write only delays it to the next start.
    const live = await writeLive(ctx, request, value).catch(() => false);
    await ctx.runMutation(internal.envVarRequests.markSaved, {
      requestId: request._id,
    });
    return { reply: savedReply(request.key, request.scope, live) };
  },
});
