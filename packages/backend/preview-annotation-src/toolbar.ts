/**
 * Floating Eva toolbar, injected into the previewed page by the sandbox proxy.
 *
 * One toolbar serves both places the preview shows up: inside Eva's iframe and
 * on a direct sandbox link. It starts as a round Eva mark; a click expands it
 * to the full set of tools; the mark drags it anywhere on the page. Position
 * and open state persist per preview origin.
 *
 * It cannot import web components: this file is bundled into the injected
 * script (`scripts/build-annotation-script.mjs`) and runs in the previewed
 * page. The markup is plain DOM inside a shadow root, so the page's CSS cannot
 * reach it and its CSS cannot leak out. Colours are fixed: the page owns its
 * theme and Eva's tokens are not reachable from here.
 *
 * The toolbar only draws and reports clicks. What each tool does lives in
 * `index.ts` (it needs the page-side state); `update` mirrors that state back.
 */

import {
  EVA_MARK_BLUE,
  EVA_MARK_BOTTOM_POINTS,
  EVA_MARK_PURPLE,
  EVA_MARK_TOP_POINTS,
} from "@eva/shared/evaMark";

export interface ToolbarView {
  selecting: boolean;
  frozen: boolean;
  /** Embedded in Eva: whether the parent can take an annotation. */
  selectEnabled: boolean;
  /** Eva-only tools stay hidden on a direct link. */
  commentsEnabled: boolean;
  commentsActive: boolean;
  commentCount: number;
  sketchEnabled: boolean;
  sketchActive: boolean;
  capturing: boolean;
  /** One-line result of the last action, e.g. "Copied". Empty hides it. */
  notice: string;
}

export interface ToolbarActions {
  select(): void;
  comments(): void;
  freeze(): void;
  sketch(): void;
  screenshot(): void;
}

export interface Toolbar {
  update(patch: Partial<ToolbarView>): void;
  /** Hides the toolbar so a screenshot does not contain it. */
  setHiddenForCapture(hidden: boolean): void;
}

type ToolName = keyof ToolbarActions;

const STORAGE_KEY = "eva-preview-toolbar";
const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 8;
const NOTICE_MS = 2500;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Tabler-style 24px stroke paths, one string of `d` values per shape. */
const TOOL_ICONS: Record<ToolName, string[]> = {
  select: [
    "M3 12h3M12 3v3M7.8 7.8L5.6 5.6M16.2 7.8l2.2-2.2M7.8 16.2l-2.2 2.2",
    "M12 12l9 3l-4 2l-2 4l-3-9",
  ],
  comments: [
    "M21 14l-3-3h-7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10",
    "M14 15v2a1 1 0 0 1-1 1h-7l-3 3v-10a1 1 0 0 1 1-1h2",
  ],
  freeze: ["M7 5h2v14H7z", "M15 5h2v14h-2z"],
  sketch: ["M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4L4 16v4", "M13.5 6.5l4 4"],
  screenshot: [
    "M5 7h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2",
    "M9 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  ],
};

const TOOL_LABELS: Record<ToolName, string> = {
  select: "Select element",
  comments: "Comments",
  freeze: "Freeze animations",
  sketch: "Sketch",
  screenshot: "Screenshot",
};

const TOOL_ORDER: ToolName[] = [
  "select",
  "comments",
  "freeze",
  "sketch",
  "screenshot",
];

const STYLES = `
:host { all: initial; position: fixed; z-index: 2147483647; font: 12px/1.3 ui-sans-serif, system-ui, sans-serif; }
.bar { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; background: rgba(23, 24, 26, 0.96); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), 0 6px 20px rgba(0, 0, 0, 0.35); color: #e8e8ea; }
button { all: unset; box-sizing: border-box; position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; cursor: pointer; color: inherit; }
button:hover { background: rgba(255, 255, 255, 0.1); }
button:focus-visible { outline: 2px solid ${EVA_MARK_BLUE}; outline-offset: 1px; }
button[aria-pressed="true"] { background: rgba(139, 63, 184, 0.35); color: #fff; }
button:disabled { opacity: 0.5; cursor: default; }
button[hidden], .tools[hidden], .notice[hidden], .badge[hidden] { display: none; }
.handle { cursor: grab; touch-action: none; }
.handle:active { cursor: grabbing; }
.tools { display: flex; align-items: center; gap: 2px; }
svg.icon { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
svg.mark { width: 28px; height: 28px; }
.badge { position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 999px; background: #fff; color: #17181a; font-size: 10px; font-weight: 600; line-height: 16px; text-align: center; }
.notice { padding: 0 10px 0 6px; white-space: nowrap; color: #c9c9cd; }
`;

interface StoredToolbar {
  left: number;
  top: number;
  expanded: boolean;
}

function readStored(): StoredToolbar | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const left = Reflect.get(parsed, "left");
    const top = Reflect.get(parsed, "top");
    const expanded = Reflect.get(parsed, "expanded");
    if (typeof left !== "number" || typeof top !== "number") return null;
    return { left, top, expanded: expanded === true };
  } catch {
    return null;
  }
}

function writeStored(value: StoredToolbar): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the toolbar still works, it just forgets its place.
  }
}

function svgElement(
  tag: "svg" | "path" | "circle" | "polygon",
  attrs: Record<string, string>,
): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, value);
  }
  return element;
}

function toolIcon(tool: ToolName): SVGElement {
  const svg = svgElement("svg", { viewBox: "0 0 24 24", class: "icon" });
  for (const d of TOOL_ICONS[tool]) svg.appendChild(svgElement("path", { d }));
  return svg;
}

function evaMark(): SVGElement {
  const svg = svgElement("svg", { viewBox: "0 0 512 512", class: "mark" });
  svg.appendChild(
    svgElement("circle", { cx: "256", cy: "256", r: "256", fill: "#17181a" }),
  );
  svg.appendChild(
    svgElement("polygon", {
      points: EVA_MARK_TOP_POINTS,
      fill: EVA_MARK_PURPLE,
    }),
  );
  svg.appendChild(
    svgElement("polygon", {
      points: EVA_MARK_BOTTOM_POINTS,
      fill: EVA_MARK_BLUE,
    }),
  );
  return svg;
}

export function mountToolbar(
  actions: ToolbarActions,
  initial: Partial<ToolbarView>,
): Toolbar {
  const view: ToolbarView = {
    selecting: false,
    frozen: false,
    selectEnabled: true,
    commentsEnabled: false,
    commentsActive: false,
    commentCount: 0,
    sketchEnabled: false,
    sketchActive: false,
    capturing: false,
    notice: "",
    ...initial,
  };
  const stored = readStored();
  let expanded = stored?.expanded ?? false;
  let noticeTimer = 0;

  const host = document.createElement("div");
  // The picker skips anything carrying this attribute, so clicks here are
  // never read as "select this element".
  host.setAttribute("data-eva-annotate-overlay", "1");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;

  const bar = document.createElement("div");
  bar.className = "bar";

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "handle";
  handle.appendChild(evaMark());

  const tools = document.createElement("div");
  tools.className = "tools";
  const buttons = new Map<ToolName, HTMLButtonElement>();
  let badge: HTMLSpanElement | null = null;
  for (const tool of TOOL_ORDER) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = TOOL_LABELS[tool];
    button.setAttribute("aria-label", TOOL_LABELS[tool]);
    button.appendChild(toolIcon(tool));
    if (tool === "comments") {
      badge = document.createElement("span");
      badge.className = "badge";
      button.appendChild(badge);
    }
    button.addEventListener("click", () => actions[tool]());
    buttons.set(tool, button);
    tools.appendChild(button);
  }
  const notice = document.createElement("span");
  notice.className = "notice";
  tools.appendChild(notice);

  bar.append(handle, tools);
  shadow.append(style, bar);

  function render(): void {
    handle.title = expanded ? "Collapse Eva toolbar" : "Open Eva toolbar";
    handle.setAttribute("aria-label", handle.title);
    handle.setAttribute("aria-expanded", String(expanded));
    tools.hidden = !expanded;
    // A collapsed circle has no padding ring.
    bar.style.padding = expanded ? "4px" : "0";
    const pressed: Record<ToolName, boolean> = {
      select: view.selecting,
      comments: view.commentsActive,
      freeze: view.frozen,
      sketch: view.sketchActive,
      screenshot: false,
    };
    const visible: Record<ToolName, boolean> = {
      select: view.selectEnabled,
      comments: view.commentsEnabled,
      freeze: true,
      sketch: view.sketchEnabled,
      screenshot: true,
    };
    for (const tool of TOOL_ORDER) {
      const button = buttons.get(tool);
      if (!button) continue;
      button.hidden = !visible[tool];
      button.setAttribute("aria-pressed", String(pressed[tool]));
    }
    const screenshotButton = buttons.get("screenshot");
    if (screenshotButton) screenshotButton.disabled = view.capturing;
    if (badge) {
      badge.hidden = view.commentCount === 0;
      badge.textContent =
        view.commentCount > 99 ? "99+" : String(view.commentCount);
    }
    notice.hidden = view.notice === "";
    notice.textContent = view.notice;
  }

  function place(left: number, top: number): void {
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  /** Keeps the whole toolbar on screen at its current size. */
  function clampIntoView(): void {
    const rect = host.getBoundingClientRect();
    const maxLeft = Math.max(EDGE_PX, window.innerWidth - rect.width - EDGE_PX);
    const maxTop = Math.max(EDGE_PX, window.innerHeight - rect.height - EDGE_PX);
    place(
      Math.min(Math.max(EDGE_PX, rect.left), maxLeft),
      Math.min(Math.max(EDGE_PX, rect.top), maxTop),
    );
  }

  function save(): void {
    const rect = host.getBoundingClientRect();
    writeStored({ left: rect.left, top: rect.top, expanded });
  }

  // Drag by the mark. A press that never moves past the threshold is a click.
  let dragStart: {
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null = null;
  let dragged = false;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    dragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    dragged = false;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragged = true;
    place(dragStart.left + dx, dragStart.top + dy);
    clampIntoView();
  });
  function endDrag(event: PointerEvent): void {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    dragStart = null;
    if (dragged) save();
  }
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  handle.addEventListener("click", () => {
    // The click that ends a drag must not toggle.
    if (dragged) {
      dragged = false;
      return;
    }
    expanded = !expanded;
    render();
    clampIntoView();
    save();
  });

  window.addEventListener("resize", clampIntoView);

  render();
  const size = 32;
  place(
    stored?.left ?? window.innerWidth - size - 16,
    stored?.top ?? window.innerHeight - size - 16,
  );
  document.documentElement.appendChild(host);
  clampIntoView();

  return {
    update(patch) {
      Object.assign(view, patch);
      render();
      if (patch.notice) {
        window.clearTimeout(noticeTimer);
        noticeTimer = window.setTimeout(() => {
          view.notice = "";
          render();
        }, NOTICE_MS);
      }
      // Tools appearing or vanishing change the width.
      clampIntoView();
    },
    setHiddenForCapture(hidden) {
      host.style.visibility = hidden ? "hidden" : "";
    },
  };
}
