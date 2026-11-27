import type { ExtractedContext } from "./types";
import type { Id } from "@eva/backend";

export type TaskStatus =
  | "draft"
  | "todo"
  | "in_progress"
  | "code_review"
  | "business_review"
  | "done"
  | "cancelled";

/** A persisted annotation pin. Stored as JSON keyed by pin id on the backend. */
export interface StoredPin {
  x: number;
  y: number;
  text: string;
  number: number;
  selector: string;
  type?: "element" | "text";
  selectedText?: string;
  ancestorSelector?: string;
  taskId?: string;
  status?: TaskStatus;
  userId?: string;
  creatorInitials?: string;
}

export const EVA_URL = import.meta.env.VITE_EVA_URL;

type BgErrorCode = "not_signed_in" | "no_repo_match" | "convex_error";

export interface BgError {
  ok: false;
  code: BgErrorCode;
  message: string;
}

/** A successful background result carrying payload `T`, or a typed error. */
export type BgResult<T extends object> = ({ ok: true } & T) | BgError;

/** Empty-but-successful result for fire-and-forget mutations. */
export type DoneOk = { done: boolean };

/** Where pins should land when added to a project. */
export type AddToProjectTarget =
  | { kind: "existing"; projectId: string }
  | { kind: "new"; title: string };

/**
 * Maps each request type to its payload (content → background) and response
 * (background → content). The single source of truth for the protocol.
 */
export interface BgRequestMap {
  GET_TOOLBAR_VISIBILITY: {
    payload: undefined;
    response: { visible: boolean };
  };
  LOAD_ANNOTATIONS: {
    payload: { pageUrl: string };
    response: BgResult<{ pins: Record<string, StoredPin> }>;
  };
  SAVE_ANNOTATIONS: {
    payload: { pageUrl: string; pins: Record<string, StoredPin> };
    response: BgResult<DoneOk>;
  };
  CREATE_ANNOTATION_TASK: {
    payload: {
      pageUrl: string;
      title: string;
      pinId: string;
      elementContext?: ExtractedContext;
    };
    response: BgResult<{
      pinId: string;
      taskId: string;
      userId?: string;
      creatorInitials: string;
    }>;
  };
  RUN_ANNOTATION_TASK: {
    payload: { taskId: string };
    response: BgResult<DoneOk>;
  };
  RUN_ALL_ANNOTATIONS: {
    payload: { pageUrl: string; pins: Record<string, StoredPin> };
    response: BgResult<{
      created: Array<{ pinId: string; taskId: string }>;
      userId?: string;
      creatorInitials: string;
      message: string;
    }>;
  };
  LIST_PROJECTS: {
    payload: { pageUrl: string };
    response: BgResult<{
      projects: Array<{ id: string; title: string; phase: string }>;
    }>;
  };
  ADD_TO_PROJECT: {
    payload: {
      pageUrl: string;
      pins: Record<string, StoredPin>;
      target: AddToProjectTarget;
    };
    response: BgResult<{ count: number; message: string }>;
  };
  SYNC_TASK_STATUSES: {
    payload: { taskIds: string[] };
    response: BgResult<{ updates: Record<string, TaskStatus> }>;
  };
  OPEN_EVA: {
    payload: { path?: string };
    response: { ok: true };
  };
}

export type BgRequestType = keyof BgRequestMap;

type BgRequestMessage<K extends BgRequestType> = {
  type: K;
  payload: BgRequestMap[K]["payload"];
};

/** Union of every possible request message (used by the background router). */
export type AnyBgRequest = {
  [K in BgRequestType]: BgRequestMessage<K>;
}[BgRequestType];

/** Union of every possible response. */
export type AnyBgResponse = BgRequestMap[BgRequestType]["response"];

/** Push message from background → content when the icon toggles visibility. */
export interface ToolbarVisibilityChangedMessage {
  type: "TOOLBAR_VISIBILITY_CHANGED";
  payload: { visible: boolean };
}

export const BG_REQUEST_TYPES: ReadonlySet<string> = new Set<BgRequestType>([
  "GET_TOOLBAR_VISIBILITY",
  "LOAD_ANNOTATIONS",
  "SAVE_ANNOTATIONS",
  "CREATE_ANNOTATION_TASK",
  "RUN_ANNOTATION_TASK",
  "RUN_ALL_ANNOTATIONS",
  "LIST_PROJECTS",
  "ADD_TO_PROJECT",
  "SYNC_TASK_STATUSES",
  "OPEN_EVA",
]);

/**
 * Send a typed request to the background worker and await its typed response.
 * Both ends share `BgRequestMap`, so the call site gets full inference.
 */
export function requestBackground<K extends BgRequestType>(
  type: K,
  payload: BgRequestMap[K]["payload"],
): Promise<BgRequestMap[K]["response"]> {
  return chrome.runtime.sendMessage<
    BgRequestMessage<K>,
    BgRequestMap[K]["response"]
  >({ type, payload });
}

export function isStoredPinRecord(
  value: unknown,
): value is Record<string, StoredPin> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  for (const v of Object.values(value)) {
    if (
      typeof v !== "object" ||
      v === null ||
      !("x" in v) ||
      typeof v.x !== "number" ||
      !("y" in v) ||
      typeof v.y !== "number"
    ) {
      return false;
    }
  }
  return true;
}

export function isTaskId(value: unknown): value is Id<"agentTasks"> {
  return typeof value === "string" && value.length > 0;
}

export function isProjectId(value: unknown): value is Id<"projects"> {
  return typeof value === "string" && value.length > 0;
}
