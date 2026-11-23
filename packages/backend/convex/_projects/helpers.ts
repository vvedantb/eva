import { v } from "convex/values";
import { z } from "zod";
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import { projectFields, conversationMessageValidator } from "../validators";
import { sessionStatusValidator } from "../_validators/enums";
import type { DataModel, Id, Doc } from "../_generated/dataModel";

type ConversationMessage = Doc<"projectDetails">["conversationHistory"][number];

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

/** Convex validator for a project document with its conversation history and generated spec. */
export const projectWithDetailsValidator = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  ...clientProjectFields,
  generatedSpec: v.optional(v.string()),
  conversationHistory: v.array(conversationMessageValidator),
  /**
   * @deprecated `interview?.workflowId`, for installed APKs (0.1.96 and older
   * read it as "interview running"). Derived, not stored. Remove once no
   * supported APK reads it.
   */
  activeWorkflowId: v.optional(v.string()),
});

const {
  conversationHistory: _ch,
  generatedSpec: _gs,
  ...projectSummaryFields
} = projectWithDetailsValidator.fields;
/** Convex validator for a project summary (excludes conversation history and generated spec). */
export const projectSummaryValidator = v.object(projectSummaryFields);

/** List rows include the project session's sandbox status. */
export const projectListItemValidator = v.object({
  ...projectSummaryFields,
  /** The project session's sandbox status (`projectSandboxStatus`). */
  sandboxStatus: v.optional(sessionStatusValidator),
  /** Unread project chat reply for this user (`chatReads.ts`). */
  hasUnread: v.boolean(),
  /** The project chat is paused on a blocking question for the user. */
  isAwaitingAnswer: v.boolean(),
});

/** Fetches the projectDetails document for a given project. */
export async function getProjectDetails(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
): Promise<Doc<"projectDetails"> | null> {
  return await db
    .query("projectDetails")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .first();
}

/** Returns the conversation history for a project, or an empty array if none exists. */
export async function getProjectConversation(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
): Promise<Array<ConversationMessage>> {
  const details = await getProjectDetails(db, projectId);
  return details?.conversationHistory ?? [];
}

/** Returns the generated spec JSON string for a project, or undefined if none exists. */
export async function getProjectGeneratedSpec(
  db: GenericDatabaseReader<DataModel>,
  projectId: Id<"projects">,
): Promise<string | undefined> {
  const details = await getProjectDetails(db, projectId);
  return details?.generatedSpec;
}

/** Creates or updates the conversation history for a project. */
export async function setProjectConversation(
  db: GenericDatabaseWriter<DataModel>,
  projectId: Id<"projects">,
  conversationHistory: Array<ConversationMessage>,
): Promise<void> {
  const existing = await db
    .query("projectDetails")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .first();
  if (existing) {
    await db.patch(existing._id, { conversationHistory });
  } else {
    await db.insert("projectDetails", { projectId, conversationHistory });
  }
}

/** Creates or updates the generated spec for a project. */
export async function setProjectGeneratedSpec(
  db: GenericDatabaseWriter<DataModel>,
  projectId: Id<"projects">,
  generatedSpec: string,
): Promise<void> {
  const existing = await db
    .query("projectDetails")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .first();
  if (existing) {
    await db.patch(existing._id, { generatedSpec });
  } else {
    await db.insert("projectDetails", {
      projectId,
      conversationHistory: [],
      generatedSpec,
    });
  }
}

/** Deletes the projectDetails document for a given project. */
export async function deleteProjectDetails(
  db: GenericDatabaseWriter<DataModel>,
  projectId: Id<"projects">,
): Promise<void> {
  const existing = await db
    .query("projectDetails")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .first();
  if (existing) {
    await db.delete(existing._id);
  }
}

const parsedTaskSchema = z
  .object({
    title: z.string().catch(""),
    description: z.string().catch(""),
  })
  .catch({ title: "", description: "" });

const parsedSpecSchema = z
  .object({
    title: z.string().catch(""),
    description: z.string().catch(""),
    tasks: z.array(parsedTaskSchema).catch([]),
  })
  .catch({ title: "", description: "", tasks: [] });

type ParsedSpec = z.infer<typeof parsedSpecSchema>;

/** Parses a JSON spec string into a structured object with title, description, and tasks. */
export function parseSpec(specJson: string): ParsedSpec {
  return parsedSpecSchema.parse(JSON.parse(specJson));
}
