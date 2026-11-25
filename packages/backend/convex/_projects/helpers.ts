import { v } from "convex/values";
import { projectFields } from "../validators";
import { sessionStatusValidator } from "../_validators/enums";
import type { Doc } from "../_generated/dataModel";

export { buildProjectBranchName } from "../_git/branchNames";

// `planningMode` is a legacy stored field (old interview projects); clients
// never read it.
const { planningMode: _planningMode, ...clientProjectFields } = projectFields;
void _planningMode;

/** A project doc as clients read it: without the legacy `planningMode`. */
export function clientProject(
  project: Doc<"projects">,
): Omit<Doc<"projects">, "planningMode"> {
  const { planningMode: _mode, ...rest } = project;
  void _mode;
  return rest;
}

/** Convex validator for a project document as clients read it. */
export const projectValidator = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  ...clientProjectFields,
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
