import { activateAnnotation, deactivateAnnotation } from "./AnnotationOverlay";

export type ToolbarMode = "annotate" | "inspect" | null;

interface ToolbarFeedback {
  message: string;
  type: "success" | "error";
  action?: "sign_in";
}

export interface ToolbarState {
  visible: boolean;
  feedback: ToolbarFeedback | null;
  loading: boolean;
  x: number;
  y: number;
  mode: ToolbarMode;
  projectModalOpen: boolean;
  signedOut: boolean;
  version: number;
}

let state: ToolbarState = {
  visible: false,
  feedback: null,
  loading: false,
  x: -1,
  y: -1,
  mode: null,
  projectModalOpen: false,
  signedOut: false,
  version: 0,
};

const subs = new Set<() => void>();

function set(patch: Partial<ToolbarState>) {
  state = { ...state, ...patch, version: state.version + 1 };
  subs.forEach((s) => s());
}

export function subscribeToolbar(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function getToolbarState(): ToolbarState {
  return state;
}

interface InspectController {
  start: () => void;
  stop: () => void;
}

let inspectController: InspectController | null = null;

export function registerInspectController(controller: InspectController): void {
  inspectController = controller;
}

export function showToolbar(): void {
  set({ visible: true });
}

export function hideToolbar(): void {
  if (state.mode === "annotate") deactivateAnnotation();
  if (state.mode === "inspect") inspectController?.stop();
  set({ visible: false, mode: null, projectModalOpen: false });
}

/** Switches the active tool. Mutually exclusive; pass null to clear. */
export function setMode(mode: ToolbarMode): void {
  if (state.mode === mode) return;
  if (state.mode === "annotate") deactivateAnnotation();
  if (state.mode === "inspect") inspectController?.stop();
  set({ mode });
  if (mode === "annotate") activateAnnotation();
  if (mode === "inspect") inspectController?.start();
}

export function setToolbarLoading(loading: boolean): void {
  set({ loading });
}

export function setToolbarFeedback(
  message: string,
  type: "success" | "error",
  action?: "sign_in",
): void {
  set({ feedback: { message, type, action }, loading: false });
  setTimeout(() => {
    if (state.feedback?.message === message) set({ feedback: null });
  }, 3000);
}

export function setSignedOut(signedOut: boolean): void {
  if (state.signedOut === signedOut) return;
  set({ signedOut });
}

export function setToolbarPosition(x: number, y: number): void {
  set({ x, y });
}

export function openProjectModal(): void {
  set({ projectModalOpen: true });
}

export function closeProjectModal(): void {
  set({ projectModalOpen: false });
}
