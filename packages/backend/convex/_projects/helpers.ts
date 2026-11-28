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
  sandboxStatus: v.optional(sessionStatusValidator),
  hasUnread: v.boolean(),
  isAwaitingAnswer: v.boolean(),
});
