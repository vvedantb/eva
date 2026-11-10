import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { withAuth, getCreatorInitials } from "./convex";
import { resolveRepoForUrl } from "./repo-matching";
import {
  buildPinDescription,
  buildContextDescription,
} from "../shared/task-description";
import {
  type StoredPin,
  type TaskStatus,
  type DoneOk,
  type BgRequestMap,
  EVA_URL,
  isTaskId,
  isProjectId,
  isStoredPinRecord,
} from "../shared/messaging";

/** Parses the JSON pin blob stored on the backend, tolerating bad data. */
function parsePins(json: string | null): Record<string, StoredPin> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return isStoredPinRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pluralTasks(count: number): string {
  return `${count} task${count !== 1 ? "s" : ""}`;
}

export function loadAnnotations(
  payload: BgRequestMap["LOAD_ANNOTATIONS"]["payload"],
): Promise<BgRequestMap["LOAD_ANNOTATIONS"]["response"]> {
  return withAuth(async (client) => {
    const json = await client.query(api.annotations.getByUrl, {
      pageUrl: payload.pageUrl,
    });
    return { pins: parsePins(json) };
  });
}

export function saveAnnotations(
  payload: BgRequestMap["SAVE_ANNOTATIONS"]["payload"],
): Promise<BgRequestMap["SAVE_ANNOTATIONS"]["response"]> {
  return withAuth(async (client): Promise<DoneOk> => {
    if (Object.keys(payload.pins).length === 0) {
      await client.mutation(api.annotations.remove, {
        pageUrl: payload.pageUrl,
      });
    } else {
      await client.mutation(api.annotations.save, {
        pageUrl: payload.pageUrl,
        pins: JSON.stringify(payload.pins),
      });
    }
    return { done: true };
  });
}

export function createAnnotationTask(
  payload: BgRequestMap["CREATE_ANNOTATION_TASK"]["payload"],
): Promise<BgRequestMap["CREATE_ANNOTATION_TASK"]["response"]> {
  return withAuth(async (client) => {
    const repoId = await resolveRepoForUrl(client, payload.pageUrl);
    const description = buildContextDescription(
      payload.title,
      payload.pageUrl,
      payload.elementContext,
    );
    const [taskId, meUserId, creatorInitials] = await Promise.all([
      client.mutation(api.agentTasks.createQuickTask, {
        repoId,
        title: payload.title.slice(0, 100),
        description,
      }),
      client.query(api.auth.me, {}),
      getCreatorInitials(),
    ]);
    return {
      pinId: payload.pinId,
      taskId: String(taskId),
      userId: meUserId,
      creatorInitials,
    };
  });
}

export function runAnnotationTask(
  payload: BgRequestMap["RUN_ANNOTATION_TASK"]["payload"],
): Promise<BgRequestMap["RUN_ANNOTATION_TASK"]["response"]> {
  return withAuth(async (client): Promise<DoneOk> => {
    if (!isTaskId(payload.taskId)) throw new Error("Invalid task id");
    await client.mutation(api.agentTasks.startExecution, {
      id: payload.taskId,
    });
    return { done: true };
  });
}

export function runAllAnnotations(
  payload: BgRequestMap["RUN_ALL_ANNOTATIONS"]["payload"],
): Promise<BgRequestMap["RUN_ALL_ANNOTATIONS"]["response"]> {
  return withAuth(async (client) => {
    const [repoId, meUserId, creatorInitials] = await Promise.all([
      resolveRepoForUrl(client, payload.pageUrl),
      client.query(api.auth.me, {}),
      getCreatorInitials(),
    ]);
    const created: Array<{ pinId: string; taskId: string }> = [];
    for (const [pinId, pin] of Object.entries(payload.pins)) {
      try {
        const taskId = await client.mutation(api.agentTasks.createQuickTask, {
          repoId,
          title: pin.text.slice(0, 100) || `Annotation #${pin.number}`,
          description: buildPinDescription(pin, payload.pageUrl),
        });
        await client.mutation(api.agentTasks.startExecution, { id: taskId });
        created.push({ pinId, taskId: String(taskId) });
      } catch (e) {
        console.error("Failed to run task:", e);
      }
    }
    return {
      created,
      userId: meUserId,
      creatorInitials,
      message: `Created & running ${pluralTasks(created.length)}`,
    };
  });
}

export function listProjects(
  payload: BgRequestMap["LIST_PROJECTS"]["payload"],
): Promise<BgRequestMap["LIST_PROJECTS"]["response"]> {
  return withAuth(async (client) => {
    const repoId = await resolveRepoForUrl(client, payload.pageUrl);
    const projects = await client.query(api.projects.list, { repoId });
    return {
      projects: projects.map((p) => ({
        id: String(p._id),
        title: p.title,
        phase: p.phase,
      })),
    };
  });
}

export function addToProject(
  payload: BgRequestMap["ADD_TO_PROJECT"]["payload"],
): Promise<BgRequestMap["ADD_TO_PROJECT"]["response"]> {
  return withAuth(async (client) => {
    const repoId = await resolveRepoForUrl(client, payload.pageUrl);
    const taskIds: Id<"agentTasks">[] = [];
    for (const pin of Object.values(payload.pins)) {
      try {
        const id = await client.mutation(api.agentTasks.createQuickTask, {
          repoId,
          title: pin.text.slice(0, 100) || `Annotation #${pin.number}`,
          description: buildPinDescription(pin, payload.pageUrl),
        });
        taskIds.push(id);
      } catch (e) {
        console.error("Failed to create task:", e);
      }
    }
    if (taskIds.length > 0) {
      if (payload.target.kind === "existing") {
        if (!isProjectId(payload.target.projectId)) {
          throw new Error("Invalid project id");
        }
        await client.mutation(api.agentTasks.assignToProject, {
          taskIds,
          projectId: payload.target.projectId,
        });
      } else {
        await client.mutation(api.projects.createFromTasks, {
          repoId,
          title: payload.target.title,
          taskIds,
        });
      }
    }
    return {
      count: taskIds.length,
      message: `Added ${pluralTasks(taskIds.length)} to project`,
    };
  });
}

export function syncTaskStatuses(
  payload: BgRequestMap["SYNC_TASK_STATUSES"]["payload"],
): Promise<BgRequestMap["SYNC_TASK_STATUSES"]["response"]> {
  return withAuth(async (client) => {
    const ids: Id<"agentTasks">[] = [];
    for (const id of payload.taskIds) {
      if (isTaskId(id)) ids.push(id);
    }
    const updates: Record<string, TaskStatus> = {};
    if (ids.length > 0) {
      const statuses = await client.query(api.agentTasks.getStatusesByIds, {
        ids,
      });
      for (const { id, status } of statuses) {
        updates[id] = status;
      }
    }
    return { updates };
  });
}

export function openEva(
  payload: BgRequestMap["OPEN_EVA"]["payload"],
): Promise<BgRequestMap["OPEN_EVA"]["response"]> {
  void chrome.tabs.create({ url: `${EVA_URL}${payload.path ?? ""}` });
  return Promise.resolve({ ok: true });
}
