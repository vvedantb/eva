/**
 * The comments drawer for a direct sandbox link: every comment of the chat,
 * with Eva's reply, filters and Resolve. It mirrors Eva's own drawer
 * (`PreviewCommentsDrawer`, React, in the Eva page) in plain DOM.
 */

import {
  listComments,
  setCommentResolved,
  type EvaComment,
  type EvaSession,
} from "./evaApi";
import { applyTheme, getTheme } from "./theme";

export interface CommentsDrawer {
  setHiddenForCapture(hidden: boolean): void;
  close(): void;
}

const POLL_MS = 4_000;
const WIDTH_PX = 380;
const INSET_PX = 8;

const STYLES = `
:host { all: initial; position: fixed; z-index: 2147483647; top: ${INSET_PX}px; right: ${INSET_PX}px; bottom: ${INSET_PX}px; font: 14px/1.4 var(--font); }
.drawer { box-sizing: border-box; display: flex; flex-direction: column; width: min(${WIDTH_PX}px, calc(100vw - ${INSET_PX * 2}px)); height: 100%; overflow: hidden; border-radius: var(--tip-radius); background: var(--field); color: var(--surface-text); box-shadow: var(--bar-shadow); }
.head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 4px; font-weight: 500; }
.filters { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 0 12px 6px; }
.seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px; background: var(--hover-bg); }
.seg button { height: 26px; padding: 0 10px; font-size: 12px; }
.list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.empty { padding: 24px 12px; text-align: center; color: var(--idle-text); }
.item { padding: 10px; border-radius: var(--tip-radius); background: var(--disc); box-shadow: 0 0 0 1px var(--border); }
.item.done { opacity: 0.7; }
.meta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11px; color: var(--idle-text); }
.chip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--field); color: var(--surface-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.time { margin-left: auto; flex: none; font-variant-numeric: tabular-nums; }
.feedback { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.reply { margin-top: 8px; padding: 6px 8px; border-radius: 8px; background: var(--hover-bg); font-size: 12px; color: var(--idle-text); }
.reply b { display: block; margin-bottom: 2px; font-weight: 500; color: var(--surface-text); }
.reply p { margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.note { margin: 8px 0 0; font-size: 11px; color: var(--idle-text); }
.row { display: flex; margin-top: 8px; }
button { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; height: 28px; padding: 0 10px; border-radius: 999px; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--idle-text); }
button:hover { background: var(--hover-bg); color: var(--hover-text); }
button:focus-visible { outline: 2px solid var(--active-text); outline-offset: 1px; }
button[aria-pressed="true"] { background: var(--active-bg); color: var(--active-text); }
button.icon { width: 28px; padding: 0; }
svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
`;

/** "now", "5m", "3h", "2d": the drawer's compact time. */
function ago(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
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
  /** Open (unresolved) comment count, for the toolbar badge. */
  onCount: (count: number) => void;
}): CommentsDrawer {
  const host = document.createElement("div");
  host.setAttribute("data-eva-annotate-overlay", "1");
  applyTheme(host, getTheme());
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
      item.appendChild(el("p", "note", "Queued, sends when Eva finishes"));
      return item;
    }
    const reply = comment.reply;
    if (reply && (reply.status === "working" || reply.status === "done")) {
      const box = el("div", "reply");
      box.appendChild(el("b", "", "Eva"));
      box.appendChild(
        el("p", "", reply.status === "working" ? "Working…" : reply.excerpt),
      );
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
    const toggle = el("button", "", comment.resolved ? "Reopen" : "Resolve");
    toggle.type = "button";
    toggle.addEventListener("click", () => {
      toggle.disabled = true;
      void setCommentResolved(session, comment.id, !comment.resolved)
        .then(refresh)
        .catch(() => {});
    });
    row.appendChild(toggle);
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
      list.replaceChildren(...shown.map(card));
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
  const timer = window.setInterval(() => void refresh(), POLL_MS);

  return {
    setHiddenForCapture(hidden) {
      host.style.visibility = hidden ? "hidden" : "";
    },
    close,
  };
}
