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

import type { PreviewToolbarTheme as ToolbarTheme } from "@eva/shared/previewFrameMessages";
import {
  EVA_MARK_BLUE,
  EVA_MARK_BOTTOM_POINTS,
  EVA_MARK_PURPLE,
  EVA_MARK_TOP_POINTS,
} from "@eva/shared/evaMark";

export type { ToolbarTheme };

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
  setTheme(theme: ToolbarTheme): void;
  /** Hides the toolbar so a screenshot does not contain it. */
  setHiddenForCapture(hidden: boolean): void;
}

type ToolName = keyof ToolbarActions;

const STORAGE_KEY = "eva-preview-toolbar";
const DRAG_THRESHOLD_PX = 4;
const TIP_DELAY_MS = 300;
const EDGE_PX = 8;
const NOTICE_MS = 2500;
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The exact `@tabler/icons-react` outline paths the old Eva bar used
 * (IconClick, IconMessages, IconPlayerPause, IconPencil, IconCamera), copied
 * from the package: this script cannot import React components.
 */
const TOOL_ICONS: Record<ToolName, string[]> = {
  select: [
    "M3 12l3 0",
    "M12 3l0 3",
    "M7.8 7.8l-2.2 -2.2",
    "M16.2 7.8l2.2 -2.2",
    "M7.8 16.2l-2.2 2.2",
    "M12 12l9 3l-4 2l-2 4l-3 -9",
  ],
  comments: [
    "M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10",
    "M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2",
  ],
  freeze: [
    "M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12",
    "M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12",
  ],
  sketch: [
    "M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4",
    "M13.5 6.5l4 4",
  ],
  screenshot: [
    "M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2",
    "M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
  ],
};

/** `@tabler/icons-react` IconX outline paths. */
const CLOSE_ICON = ["M18 6l-12 12", "M6 6l12 12"];

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

const BAR_SHADOW_BASE =
  "color(srgb 0 0 0 / 0.05) 0px 25px 50px 0px, color(srgb 0 0 0 / 0.04) 0px 12px 24px 0px, color(srgb 0 0 0 / 0.03) 0px 6px 12px 0px, color(srgb 0 0 0 / 0.02) 0px 3px 6px 0px, color(srgb 0 0 0 / 0.02) 0px 1.5px 3px 0px";
const TIP_SHADOW_BASE =
  "color(srgb 0 0 0 / 0.04) 0px 17.54px 23.39px 0px, color(srgb 0 0 0 / 0.03) 0px 9.4px 12.5px 0px, color(srgb 0 0 0 / 0.02) 0px 5.25px 7px 0px, color(srgb 0 0 0 / 0.01) 0px 2.79px 3.72px -2px, color(srgb 0 0 0 / 0.01) 0px 1.16px 1.5px 0px";

/**
 * Direct link: no Eva to read tokens from, so these are Eva's own resolved
 * values (measured from the app's light and dark themes with the probe in
 * `previewToolbarTheme.ts`), picked by the page's colour scheme. Re-measure
 * them if Eva's tokens change.
 */
const LIGHT_THEME: ToolbarTheme = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  surface: "oklab(1 0 0 / 0.95)",
  surfaceText: "oklch(0.2103 0 0)",
  barShadow: `${BAR_SHADOW_BASE}, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px`,
  tipShadow: `${TIP_SHADOW_BASE}, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px`,
  tipRadius: "16px",
  idleText: "oklch(0.5517 0 0)",
  hoverBg: "oklab(0.9524 0 0 / 0.6)",
  hoverText: "oklch(0.2103 0 0)",
  activeBg: "oklch(0.94 0 0)",
  activeText: "oklch(0.2103 0 0)",
  badgeBg: "oklch(0.2103 0 0)",
  badgeText: "oklch(0.9702 0 0)",
  disc: "oklch(0.98 0 0)",
  destructive: "oklch(0.6532 0.2335 25.74)",
};
const DARK_THEME: ToolbarTheme = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  surface: "oklab(0.313316 0.000133276 -0.0054974 / 0.95)",
  surfaceText: "oklch(0.9911 0 0)",
  barShadow: `${BAR_SHADOW_BASE}, rgba(255, 255, 255, 0.18) 0px 0px 0px 1px`,
  tipShadow: `${TIP_SHADOW_BASE}, rgba(255, 255, 255, 0.18) 0px 0px 0px 1px`,
  tipRadius: "16px",
  idleText: "rgb(159, 160, 162)",
  hoverBg: "oklab(0.352463 0.000133812 -0.00533339 / 0.6)",
  hoverText: "rgb(250, 250, 250)",
  activeBg: "rgb(68, 69, 72)",
  activeText: "oklch(0.9911 0 0)",
  badgeBg: "rgb(250, 250, 250)",
  badgeText: "rgb(34, 35, 37)",
  disc: "rgb(48, 49, 52)",
  destructive: "oklch(0.594 0.1973 24.63)",
};

/** Sizes mirror the old bar: `p-1` pill, `size-8` buttons, `size-4` icons. */
const STYLES = `
:host { all: initial; position: fixed; z-index: 2147483647; font: 12px/1.3 var(--font); }
.bar { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; background: var(--surface); color: var(--surface-text); box-shadow: var(--bar-shadow); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
button { all: unset; box-sizing: border-box; position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; cursor: pointer; color: var(--idle-text); transition: transform 120ms ease; }
button:hover { background: var(--hover-bg); color: var(--hover-text); }
button:active { transform: scale(0.96); }
button:focus-visible { outline: 2px solid var(--active-text); outline-offset: 2px; }
button[aria-pressed="true"] { background: var(--active-bg); color: var(--active-text); }
button:disabled { opacity: 0.45; cursor: default; pointer-events: none; }
button[hidden], .tools[hidden], .notice[hidden], .badge[hidden], .tip[hidden] { display: none; }
.handle, .handle:hover { cursor: grab; touch-action: none; background: none; }
.handle:active { cursor: grabbing; }
.handle svg.icon { color: var(--destructive); }
.tools { display: flex; align-items: center; gap: 2px; }
svg.icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
svg.mark { width: 32px; height: 32px; }
.badge { position: absolute; top: -2px; right: -2px; display: flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 999px; background: var(--badge-bg); color: var(--badge-text); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.notice { padding: 0 10px 0 6px; white-space: nowrap; color: var(--idle-text); }
.tip { position: absolute; bottom: calc(100% + 8px); left: 0; padding: 6px 12px; border-radius: var(--tip-radius); background: var(--surface); color: var(--surface-text); box-shadow: var(--tip-shadow); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); font-size: 12px; white-space: nowrap; pointer-events: none; transform: translateX(-50%); }
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
    svgElement("circle", { cx: "256", cy: "256", r: "256", fill: "var(--disc)" }),
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
  bar.style.position = "relative";

  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  let tipTimer = 0;
  // Same 300ms delay as Eva's tooltips; shown above the button, or below it
  // when the toolbar sits at the top edge.
  function showTip(button: HTMLElement, label: string): void {
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      tip.textContent = label;
      tip.style.left = `${button.offsetLeft + button.offsetWidth / 2}px`;
      const above = host.getBoundingClientRect().top > 48;
      tip.style.bottom = above ? "calc(100% + 8px)" : "auto";
      tip.style.top = above ? "auto" : "calc(100% + 8px)";
      tip.hidden = false;
    }, TIP_DELAY_MS);
  }
  function hideTip(): void {
    window.clearTimeout(tipTimer);
    tip.hidden = true;
  }
  function withTip(button: HTMLElement, label: () => string): void {
    button.addEventListener("pointerenter", () => showTip(button, label()));
    button.addEventListener("pointerleave", hideTip);
    button.addEventListener("pointerdown", hideTip);
  }

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "handle";
  // Closed: the Eva mark. Open: an X, so the mark reads as "close".
  const mark = evaMark();
  const closeIcon = svgElement("svg", { viewBox: "0 0 24 24", class: "icon" });
  for (const d of CLOSE_ICON) closeIcon.appendChild(svgElement("path", { d }));
  handle.append(mark, closeIcon);

  const tools = document.createElement("div");
  tools.className = "tools";
  const buttons = new Map<ToolName, HTMLButtonElement>();
  let badge: HTMLSpanElement | null = null;
  for (const tool of TOOL_ORDER) {
    const button = document.createElement("button");
    button.type = "button";
    withTip(button, () => TOOL_LABELS[tool]);
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

  withTip(handle, () => (expanded ? "Collapse" : "Eva tools"));
  bar.append(tools, handle, tip);
  shadow.append(style, bar);

  function render(): void {
    handle.setAttribute(
      "aria-label",
      expanded ? "Collapse Eva toolbar" : "Open Eva toolbar",
    );
    handle.setAttribute("aria-expanded", String(expanded));
    tools.hidden = !expanded;
    mark.style.display = expanded ? "none" : "";
    closeIcon.style.display = expanded ? "" : "none";
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
    // The mark sits at the right end: keep it under the pointer, so the
    // tools open and close towards the left.
    const markLeft = handle.getBoundingClientRect().left;
    expanded = !expanded;
    render();
    const rect = host.getBoundingClientRect();
    place(rect.left + markLeft - handle.getBoundingClientRect().left, rect.top);
    clampIntoView();
    save();
  });

  window.addEventListener("resize", clampIntoView);

  function applyTheme(theme: ToolbarTheme): void {
    const vars: Record<string, string> = {
      "--font": theme.fontFamily,
      "--surface": theme.surface,
      "--surface-text": theme.surfaceText,
      "--bar-shadow": theme.barShadow,
      "--tip-shadow": theme.tipShadow,
      "--tip-radius": theme.tipRadius,
      "--idle-text": theme.idleText,
      "--hover-bg": theme.hoverBg,
      "--hover-text": theme.hoverText,
      "--active-bg": theme.activeBg,
      "--active-text": theme.activeText,
      "--badge-bg": theme.badgeBg,
      "--badge-text": theme.badgeText,
      "--disc": theme.disc,
      "--destructive": theme.destructive,
    };
    for (const [name, value] of Object.entries(vars)) {
      host.style.setProperty(name, value);
    }
  }
  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(darkScheme.matches ? DARK_THEME : LIGHT_THEME);

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
    setTheme(theme) {
      applyTheme(theme);
    },
    setHiddenForCapture(hidden) {
      host.style.visibility = hidden ? "hidden" : "";
    },
  };
}
