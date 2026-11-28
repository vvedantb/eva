import { v } from "convex/values";
import { randomToken, sha256Hex } from "@vvedantb/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { authMutation, authQuery, hasRepoAccess } from "../functions";
import { resolvePublicConvexSiteUrl } from "../_env/publicConvexUrls";
import { automationTrigger } from "./systemAutomations";
import { triggerHasEvent } from "../_automationEvents/labels";

/** Route prefix in `http.ts`; the automation id follows it. */
export const AXIOM_ALERT_PATH_PREFIX = "/api/alerts/axiom/";

async function alertAutomation(
  db: DatabaseReader,
  userId: Id<"users">,
  id: Id<"automations">,
): Promise<Doc<"automations"> | null> {
  const automation = await db.get(id);
  if (automation === null || automation.deletedAt !== undefined) return null;
  if (!triggerHasEvent(automationTrigger(automation), "production_alert")) {
    return null;
  }
  if (!(await hasRepoAccess(db, automation.repoId, userId))) return null;
  return automation;
}

/** URL to paste into Axiom, and whether a secret exists yet. */
export const getAlertWebhook = authQuery({
  args: { id: v.id("automations") },
  returns: v.union(
    v.null(),
    v.object({ url: v.union(v.string(), v.null()), hasSecret: v.boolean() }),
  ),
  handler: async (ctx, { id }) => {
    const automation = await alertAutomation(ctx.db, ctx.userId, id);
    if (automation === null) return null;
    const siteUrl = resolvePublicConvexSiteUrl(process.env);
    return {
      url:
        siteUrl === undefined
          ? null
          : `${siteUrl}${AXIOM_ALERT_PATH_PREFIX}${String(id)}`,
      hasSecret: automation.alertSecretHash !== undefined,
    };
  },
});

/**
 * Makes a new secret and returns it once. The old one stops working at once,
 * so the Axiom notifier must be updated with the new value.
 */
export const rotateAlertSecret = authMutation({
  args: { id: v.id("automations") },
  returns: v.string(),
  handler: async (ctx, { id }) => {
    const automation = await alertAutomation(ctx.db, ctx.userId, id);
    if (automation === null) throw new Error("Automation not found");
    const secret = randomToken(32, "base64url");
    await ctx.db.patch(id, {
      alertSecretHash: await sha256Hex(secret),
      updatedAt: Date.now(),
    });
    return secret;
  },
});
