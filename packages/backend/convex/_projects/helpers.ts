import { v } from "convex/values";
import { projectFields } from "../validators";
import { sessionStatusValidator } from "../_validators/enums";

export { buildProjectBranchName } from "../_git/branchNames";

/** Convex validator for a project document as clients read it. */
export const projectValidator = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  ...projectFields,
});

/** List rows include the project session's sandbox status. */
export const projectListItemValidator = v.object({
  ...projectValidator.fields,
  /** The project session's sandbox status (`projectSandboxStatus`). */
  sandboxStatus: v.optional(sessionStatusValidator),
  /** Unread project chat reply for this user (`chatReads.ts`). */
  hasUnread: v.boolean(),
  /** The project chat is paused on a blocking question for the user. */
  isAwaitingAnswer: v.boolean(),
});
