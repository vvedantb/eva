import {
  type AnyBgRequest,
  type AnyBgResponse,
  type ToolbarVisibilityChangedMessage,
  BG_REQUEST_TYPES,
} from "../shared/messaging";
import {
  loadAnnotations,
  saveAnnotations,
  createAnnotationTask,
  runAnnotationTask,
  runAllAnnotations,
  listProjects,
  addToProject,
  syncTaskStatuses,
  openEva,
} from "./handlers";

function visKey(tabId: number): string {
  return `toolbarVisible:${tabId}`;
}

async function getVisibility(tabId: number | undefined): Promise<boolean> {
  if (tabId === undefined) return false;
  const key = visKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return stored[key] === true;
}

function applyBadge(tabId: number, visible: boolean): void {
  if (visible) {
    void chrome.action.setBadgeText({ tabId, text: "●" });
    void chrome.action.setBadgeBackgroundColor({ tabId, color: "#00000000" });
    void chrome.action.setBadgeTextColor({ tabId, color: "#22c55e" });
  } else {
    void chrome.action.setBadgeText({ tabId, text: "" });
  }
}

async function setVisibility(tabId: number, visible: boolean): Promise<void> {
  await chrome.storage.session.set({ [visKey(tabId)]: visible });
  applyBadge(tabId, visible);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  const current = await getVisibility(tabId);
  const next = !current;
  await setVisibility(tabId, next);
  const message: ToolbarVisibilityChangedMessage = {
    type: "TOOLBAR_VISIBILITY_CHANGED",
    payload: { visible: next },
  };
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await setVisibility(tabId, current);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(visKey(tabId));
});

function handleRequest(
  message: AnyBgRequest,
  sender: chrome.runtime.MessageSender,
): Promise<AnyBgResponse> {
  switch (message.type) {
    case "GET_TOOLBAR_VISIBILITY":
      return getVisibility(sender.tab?.id).then((visible) => ({ visible }));
    case "LOAD_ANNOTATIONS":
      return loadAnnotations(message.payload);
    case "SAVE_ANNOTATIONS":
      return saveAnnotations(message.payload);
    case "CREATE_ANNOTATION_TASK":
      return createAnnotationTask(message.payload);
    case "RUN_ANNOTATION_TASK":
      return runAnnotationTask(message.payload);
    case "RUN_ALL_ANNOTATIONS":
      return runAllAnnotations(message.payload);
    case "LIST_PROJECTS":
      return listProjects(message.payload);
    case "ADD_TO_PROJECT":
      return addToProject(message.payload);
    case "SYNC_TASK_STATUSES":
      return syncTaskStatuses(message.payload);
    case "OPEN_EVA":
      return openEva(message.payload);
  }
}

chrome.runtime.onMessage.addListener((message: AnyBgRequest, sender, reply) => {
  if (!message || !BG_REQUEST_TYPES.has(message.type)) return false;
  void handleRequest(message, sender).then(reply);
  return true;
});
