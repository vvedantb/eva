/**
 * The note card shown after Select element on a direct sandbox link, where
 * Eva's own comment card (React, in the Eva page) does not exist. It mirrors
 * that card: the element's chips, a note field and two buttons. With no chat to
 * send to, the main button copies the note and the element's context.
 *
 * Plain DOM in a shadow root, like the toolbar, using the same theme variables.
 */

import { applyTheme, getTheme } from "./theme";

export interface SelectionCardInfo {
  /** `<div.card>`: tag and first class. */
  chip: string;
  /** Nearest React component name, or "". */
  reactName: string;
  /** Trimmed text of the element, or "". */
  text: string;
  /** Role / aria summary, or "". */
  accessibility: string;
}

export interface SelectionCard {
  /** Follows the element when the page scrolls or resizes. */
  reposition(rect: Rect): void;
  setHiddenForCapture(hidden: boolean): void;
  close(): void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH_PX = 320;
const GUTTER_PX = 16;
const GAP_PX = 8;

const STYLES = `
:host { all: initial; position: fixed; z-index: 2147483647; font: 14px/1.4 var(--font); }
.card { box-sizing: border-box; width: min(${CARD_WIDTH_PX}px, calc(100vw - ${GUTTER_PX * 2}px)); padding: 12px; border-radius: var(--tip-radius); background: var(--surface); color: var(--surface-text); box-shadow: var(--bar-shadow); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.chips { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; color: var(--idle-text); min-width: 0; }
.chip { flex: none; padding: 2px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--disc); }
.chip.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--surface-text); }
.text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: italic; }
.a11y { margin: 0 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--idle-text); }
textarea { all: unset; box-sizing: border-box; display: block; width: 100%; min-height: 80px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--field); color: var(--surface-text); font: inherit; font-size: 14px; white-space: pre-wrap; resize: none; }
textarea::placeholder { color: var(--idle-text); }
textarea:focus-visible { outline: 2px solid var(--active-text); outline-offset: 1px; }
.error { margin: 8px 0 0; font-size: 12px; color: var(--destructive); }
.error[hidden] { display: none; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
button { all: unset; box-sizing: border-box; display: flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--idle-text); transition: transform 120ms ease; }
button:hover { background: var(--hover-bg); color: var(--hover-text); }
button:active { transform: scale(0.96); }
button:focus-visible { outline: 2px solid var(--active-text); outline-offset: 1px; }
button.primary { background: var(--primary); color: var(--primary-text); }
button.primary:hover { background: var(--primary); opacity: 0.9; color: var(--primary-text); }
button:disabled { opacity: 0.45; cursor: default; pointer-events: none; }
`;

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

export function openSelectionCard({
  info,
  rect,
  submitLabel,
  requireNote,
  onSubmit,
  onCancel,
}: {
  info: SelectionCardInfo;
  rect: Rect;
  /** "Send to Eva" with a session, "Copy for Eva" without one. */
  submitLabel: string;
  /** A send needs a note; a copy works with none. */
  requireNote: boolean;
  /** Resolves null when done (the card closes), or a message to show. */
  onSubmit: (note: string) => Promise<string | null>;
  onCancel: () => void;
}): SelectionCard {
  const host = document.createElement("div");
  // The picker skips anything carrying this attribute.
  host.setAttribute("data-eva-annotate-overlay", "1");
  applyTheme(host, getTheme());
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;

  const card = document.createElement("div");
  card.className = "card";

  const chips = document.createElement("div");
  chips.className = "chips";
  chips.appendChild(span("chip mono", info.chip));
  if (info.reactName) chips.appendChild(span("chip", info.reactName));
  if (info.text) {
    chips.appendChild(
      span("text", info.text.length > 60 ? `${info.text.slice(0, 57)}...` : info.text),
    );
  }
  card.appendChild(chips);
  if (info.accessibility) {
    const a11y = document.createElement("p");
    a11y.className = "a11y";
    a11y.textContent = info.accessibility;
    card.appendChild(a11y);
  }

  const field = document.createElement("textarea");
  field.placeholder = "What should Eva change?";
  field.setAttribute("aria-label", "Note for Eva");
  card.appendChild(field);

  const actions = document.createElement("div");
  actions.className = "actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "primary";
  copy.textContent = submitLabel;
  actions.append(cancel, copy);
  const error = document.createElement("p");
  error.className = "error";
  error.hidden = true;
  card.append(error, actions);
  const syncEnabled = (): void => {
    copy.disabled = requireNote && field.value.trim() === "";
  };
  syncEnabled();
  field.addEventListener("input", syncEnabled);
  shadow.append(style, card);

  function reposition(next: Rect): void {
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const maxLeft = window.innerWidth - width - GUTTER_PX;
    const left = Math.min(Math.max(GUTTER_PX, next.left), Math.max(GUTTER_PX, maxLeft));
    // Below the element; above it when there is no room; never off screen.
    const below = next.top + next.height + GAP_PX;
    const above = next.top - height - GAP_PX;
    const fitsBelow = below + height <= window.innerHeight - GAP_PX;
    const top = fitsBelow
      ? below
      : above >= GAP_PX
        ? above
        : Math.max(GAP_PX, window.innerHeight - height - GAP_PX);
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  let done = false;
  function finish(): void {
    if (done) return;
    done = true;
    host.remove();
  }
  function submit(): void {
    if (done || copy.disabled) return;
    copy.disabled = true;
    error.hidden = true;
    void onSubmit(field.value.trim()).then((message) => {
      if (message === null) {
        finish();
        return;
      }
      error.textContent = message;
      error.hidden = false;
      syncEnabled();
    });
  }
  cancel.addEventListener("click", () => {
    finish();
    onCancel();
  });
  copy.addEventListener("click", submit);
  // The page has its own shortcuts (a "/" search, arrow keys): typing here
  // must not reach them.
  for (const type of ["keydown", "keyup", "keypress"]) {
    shadow.addEventListener(type, (event) => event.stopPropagation());
  }
  field.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
      onCancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  document.documentElement.appendChild(host);
  reposition(rect);
  field.focus();

  return {
    reposition,
    setHiddenForCapture(hidden) {
      host.style.visibility = hidden ? "hidden" : "";
    },
    close: finish,
  };
}
