import { v } from "convex/values";
import { z } from "zod";
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import { projectDetailsFields, projectFields } from "../validators";
import type { DataModel, Id, Doc } from "../_generated/dataModel";

type ConversationMessage = Doc<"projectDetails">["conversationHistory"][number];

export { buildProjectBranchName } from "../_git/branchNames";

/** Convex validator for a project summary (excludes conversation history and generated spec). */
export const projectSummaryValidator = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  ...projectFields,
});

/** Convex validator for a project document with its conversation history and generated spec. */
export const projectWithDetailsValidator = v.object({
  ...projectSummaryValidator.fields,
  generatedSpec: projectDetailsFields.generatedSpec,
  conversationHistory: projectDetailsFields.conversationHistory,
});

export const projectPlanningModeValidator = v.union(
  v.literal("interview"),
  v.literal("tasks_only"),
);

/** List rows always include a resolved planning mode (stored or inferred). */
export const projectListItemValidator = v.object({
  ...projectSummaryValidator.fields,
  planningMode: projectPlanningModeValidator,
  /** Unread project chat reply for this user (`chatReads.ts`). */
  hasUnread: v.boolean(),
});

/** Infers interview vs tasks-only for projects created before `planningMode` existed. */
export async function resolveProjectPlanningMode(
  db: GenericDatabaseReader<DataModel>,
  project: Doc<"projects">,
): Promise<"interview" | "tasks_only"> {
  if (project.planningMode) return project.planningMode;
  const details = await getProjectDetails(db, project._id);
  if (!details) return "tasks_only";
  if (details.generatedSpec) return "interview";
  if (details.conversationHistory.length > 0) return "interview";
  return "tasks_only";
}

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
    dependencies: z.array(z.number()).catch([]),
  })
  .catch({ title: "", description: "", dependencies: [] });

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
