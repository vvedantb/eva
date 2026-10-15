import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveDocMentions } from "./resolveDocMentions";
import { stripSkillTokens } from "./skillToken";

export interface ResolvedMessageTokensResult {
  resolvedMessage: string;
  prefixBlock: string;
}

/** Resolves doc `@` mentions and strips visual skill `/` tokens for chat execution prompts. */
export async function resolveMessageTokens(
  ctx: QueryCtx,
  message: string,
  repoId: Id<"githubRepos">,
): Promise<ResolvedMessageTokensResult> {
  const { resolvedMessage: afterDocs, prefixBlock: docBlock } =
    await resolveDocMentions(ctx, message, repoId);
  return {
    resolvedMessage: stripSkillTokens(afterDocs),
    prefixBlock: docBlock,
  };
}
