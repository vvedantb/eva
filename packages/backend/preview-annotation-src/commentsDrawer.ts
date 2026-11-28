import {
  listComments,
  setCommentResolved,
  type EvaComment,
  type EvaSession,
} from "./evaApi";
import { messageLinkHref } from "@eva/shared/messageLink";
import { applyTheme, getTheme } from "./theme";

export interface CommentsDrawer {
  setHiddenForCapture(hidden: boolean): void;
  close(): void;
}

const POLL_MS = 3_000;
const MAX_WIDTH_PX = 320;
const MAX_SHARE = 0.62;
const INSET_PX = 8;

const STYLES = `
:host { all: initial; position: fixed; z-index: 2147483647; top: ${INSET_PX}px; right: ${INSET_PX}px; bottom: ${INSET_PX}px; font: 16px/24px var(--font); letter-spacing: -0.02em; }
.drawer { box-sizing: border-box; display: flex; flex-direction: column; width: var(--drawer-width); height: 100%; overflow: hidden; border-radius: var(--tip-radius); background: var(--field); color: var(--surface-text); box-shadow: var(--bar-shadow); opacity: 0; transform: scale(0.98); transition: opacity 160ms ease-out, transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1); }
.drawer.in { opacity: 1; transform: none; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px 4px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: 0; }
.filters { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 0 12px 6px; }
.seg { box-sizing: border-box; display: inline-flex; align-items: center; height: 32px; padding: 4px; border-radius: var(--tip-radius); background: var(--tab-track); color: var(--idle-text); }
.seg button { gap: 0; height: 24px; padding: 0 10px; border-radius: 16px; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: 0.005em; color: var(--idle-text); }
.seg button[aria-pressed="true"] { background: var(--tab-pill); color: var(--surface-text); }
.list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.group { display: flex; flex-direction: column; gap: 8px; }
.group h3 { margin: 0; padding: 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 11px/16px Menlo, ui-monospace, SFMono-Regular, monospace; letter-spacing: 0.01em; color: var(--idle-text); }
.empty { margin: 0; padding: 24px 12px; text-align: center; font-size: 14px; line-height: 20px; color: var(--idle-text); }
.item { padding: 10px; border-radius: var(--tip-radius); background: var(--disc); box-shadow: var(--tip-shadow); opacity: 1; animation: enter 200ms ease-out both; }
.item.done { opacity: 0.7; }
@keyframes enter { from { opacity: 0; transform: translateY(4px); } }
.meta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11px; line-height: 16px; letter-spacing: 0.01em; color: var(--idle-text); }
.chip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 6px; border: 1px solid var(--border); border-radius: 10px; background: var(--field); color: var(--surface-text); font-family: Menlo, ui-monospace, SFMono-Regular, monospace; }
.time { margin-left: auto; flex: none; font-variant-numeric: tabular-nums; }
.feedback { margin: 0; font-size: 14px; line-height: 20px; letter-spacing: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.reply { margin-top: 8px; padding: 6px 8px; border-radius: 10px; background: var(--muted); font-size: 12px; line-height: 16px; letter-spacing: 0.005em; color: var(--idle-text); }
.reply b { display: block; margin-bottom: 2px; font-weight: 500; color: var(--surface-text); }
.reply p { margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.working { display: flex; align-items: center; gap: 6px; }
.working i { width: 6px; height: 6px; border-radius: 999px; background: var(--primary); animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
@keyframes pulse { 50% { opacity: 0.5; } }
.queued { margin: 8px 0 0; padding: 6px 8px; border-radius: 10px; background: var(--muted); font-size: 12px; line-height: 16px; letter-spacing: 0.005em; color: var(--warning); }
.note { margin: 8px 0 0; font-size: 11px; line-height: 16px; letter-spacing: 0.01em; color: var(--idle-text); }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
button { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 999px; cursor: pointer; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; color: var(--idle-text); transition: transform 120ms ease; }
button:hover { background: var(--hover-bg); color: var(--hover-text); }
button:active { transform: scale(0.96); }
button:focus-visible { outline: 2px solid var(--active-text); outline-offset: 1px; }
button.secondary { background: var(--active-bg); color: var(--secondary-text); }
button.secondary:hover { opacity: 0.9; }
button:disabled { opacity: 0.45; cursor: default; pointer-events: none; }
button.icon { width: 24px; height: 24px; padding: 0; }
svg { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
`;

const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5l10 -10"/></svg>';
const UNDO =
  '<svg viewBox="0 0 24 24"><path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>';
const ARROW_UP_RIGHT =
  '<svg viewBox="0 0 24 24"><path d="M17 7l-10 10"/><path d="M8 7l9 0l0 9"/></svg>';

function ago(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function pathOnly(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openCommentsDrawer({
  session,
  onClose,
  onCount,
}: {
  session: EvaSession;
  onClose: () => void;
  onCount: (count: number) => void;
}): CommentsDrawer {
  const host = document.createElement("div");
  host.setAttribute("data-eva-annotate-overlay", "1");
  applyTheme(host, getTheme());
  const resize = (): void => {
    const width = Math.min(MAX_WIDTH_PX, Math.round(window.innerWidth * MAX_SHARE));
    host.style.setProperty("--drawer-width", `${width}px`);
  };
  resize();
  window.addEventListener("resize", resize);
  const shadow = host.attachShadow({ mode: "open" });
  const style = el("style", "");
  style.textContent = STYLES;

  let comments: EvaComment[] = [];
  let loaded = false;
  let scope: "page" | "all" = "page";
  let status: "open" | "resolved" = "open";

  const drawer = el("div", "drawer");
  const head = el("div", "head");
  head.appendChild(el("span", "", "Comments"));
  const closeButton = el("button", "icon");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close comments");
  closeButton.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
  head.appendChild(closeButton);
  const filters = el("div", "filters");
  const list = el("div", "list");
  drawer.append(head, filters, list);
  shadow.append(style, drawer);

  function segment<T extends string>(
    label: string,
    options: { value: T; text: string }[],
    current: T,
    pick: (value: T) => void,
  ): HTMLElement {
    const group = el("div", "seg");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    for (const option of options) {
      const button = el("button", "", option.text);
      button.type = "button";
      button.setAttribute("aria-pressed", String(option.value === current));
      button.addEventListener("click", () => pick(option.value));
      group.appendChild(button);
    }
    return group;
  }

  function card(comment: EvaComment): HTMLElement {
    const item = el("div", comment.resolved ? "item done" : "item");
    const meta = el("div", "meta");
    meta.append(el("span", "chip", comment.element), el("span", "time", ago(comment.timestamp)));
    item.append(meta, el("p", "feedback", comment.feedback));
    if (comment.kind === "queued") {
      item.appendChild(el("p", "queued", "Queued, sends when Eva finishes"));
      return item;
    }
    const reply = comment.reply;
    if (reply && (reply.status === "working" || reply.status === "done")) {
      const box = el("div", "reply");
      box.appendChild(el("b", "", "Eva"));
      if (reply.status === "working") {
        const working = el("p", "working");
        working.append(el("i", ""), document.createTextNode("Working…"));
        box.appendChild(working);
      } else {
        box.appendChild(el("p", "", reply.excerpt));
      }
      item.appendChild(box);
    }
    if (comment.resolved) {
      item.appendChild(
        el(
          "p",
          "note",
          `Resolved by ${comment.resolved.byName} · ${ago(comment.resolved.at)}`,
        ),
      );
    }
    const row = el("div", "row");
    const toggle = el("button", "");
    toggle.type = "button";
    toggle.innerHTML = comment.resolved ? UNDO : CHECK;
    toggle.append(document.createTextNode(comment.resolved ? "Reopen" : "Resolve"));
    toggle.addEventListener("click", () => {
      toggle.disabled = true;
      void setCommentResolved(session, comment.id, !comment.resolved)
        .then(refresh)
        .catch(() => {});
    });
    row.appendChild(toggle);
    const view = session.view;
    if (view) {
      const open = el("button", "secondary");
      open.type = "button";
      open.append(document.createTextNode("View in chat"));
      open.insertAdjacentHTML("beforeend", ARROW_UP_RIGHT);
      open.addEventListener("click", () => {
        window.open(messageLinkHref(view, comment.id), "_blank", "noopener");
      });
      row.appendChild(open);
    }
    item.appendChild(row);
    return item;
  }

  function render(): void {
    const here = pathOnly(window.location.pathname + window.location.search);
    const isDone = (c: EvaComment) => c.resolved !== null;
    const inScope = (c: EvaComment) => scope === "all" || pathOnly(c.pagePath) === here;
    const inStatus = (c: EvaComment) => isDone(c) === (status === "resolved");
    const withStatus = comments.filter(inStatus);
    const withScope = comments.filter(inScope);
    const resolvedCount = withScope.filter(isDone).length;
    const onPage = withStatus.filter((c) => pathOnly(c.pagePath) === here).length;

    filters.replaceChildren(
      segment(
        "Which pages",
        [
          { value: "page" as const, text: `On this page (${onPage})` },
          { value: "all" as const, text: `All comments (${withStatus.length})` },
        ],
        scope,
        (value) => {
          scope = value;
          render();
        },
      ),
      segment(
        "Open or resolved",
        [
          { value: "open" as const, text: `Open (${withScope.length - resolvedCount})` },
          { value: "resolved" as const, text: `Resolved (${resolvedCount})` },
        ],
        status,
        (value) => {
          status = value;
          render();
        },
      ),
    );

    const shown = withStatus.filter(inScope);
    if (!loaded) {
      list.replaceChildren(el("p", "empty", "Loading…"));
    } else if (shown.length === 0) {
      list.replaceChildren(
        el(
          "p",
          "empty",
          status === "resolved"
            ? "No resolved comments."
            : scope === "page"
              ? "No open comments on this page. Use Select element to add one."
              : "No open comments. Use Select element to add one.",
        ),
      );
    } else {
      if (scope === "all") {
        const groups = new Map<string, EvaComment[]>();
        for (const comment of shown) {
          const key = pathOnly(comment.pagePath);
          groups.set(key, [...(groups.get(key) ?? []), comment]);
        }
        list.replaceChildren(
          ...[...groups].map(([path, group]) => {
            const section = el("section", "group");
            section.append(el("h3", "", path), ...group.map(card));
            return section;
          }),
        );
      } else {
        const section = el("section", "group");
        section.append(...shown.map(card));
        list.replaceChildren(section);
      }
    }
    onCount(comments.filter((c) => !isDone(c)).length);
  }

  function refresh(): Promise<void> {
    return listComments(session).then(
      (next) => {
        comments = next;
        loaded = true;
        render();
      },
      () => {
        loaded = true;
        render();
      },
    );
  }

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    window.clearInterval(timer);
    window.removeEventListener("resize", resize);
    host.remove();
  }
  closeButton.addEventListener("click", () => {
    close();
    onClose();
  });
  for (const type of ["keydown", "keyup", "keypress"]) {
    shadow.addEventListener(type, (event) => event.stopPropagation());
  }
  shadow.addEventListener("keydown", (event) => {
    if (event instanceof KeyboardEvent && event.key === "Escape") {
      close();
      onClose();
    }
  });

  document.documentElement.appendChild(host);
  render();
  void refresh();
  window.requestAnimationFrame(() => drawer.classList.add("in"));
  const timer = window.setInterval(() => void refresh(), POLL_MS);

  return {
    setHiddenForCapture(hidden) {
      host.style.visibility = hidden ? "hidden" : "";
    },
    close,
  };
}
