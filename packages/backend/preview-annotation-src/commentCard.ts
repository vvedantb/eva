import { applyTheme, getTheme } from "./theme";

export interface SelectionCardInfo {
  chip: string;
  reactName: string;
  text: string;
  accessibility: string;
  html: string;
  styles: { prop: string; value: string }[];
}

export interface SelectionCard {
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
:host { all: initial; position: fixed; z-index: 2147483647; font: 16px/24px var(--font); letter-spacing: -0.02em; }
.card { box-sizing: border-box; width: min(${CARD_WIDTH_PX}px, calc(100vw - ${GUTTER_PX * 2}px)); padding: 12px; border-radius: var(--tip-radius); background: var(--popover); color: var(--surface-text); box-shadow: var(--bar-shadow); opacity: 0; transform: scale(0.96); transition: opacity 160ms ease-out, transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1); }
.card.in { opacity: 1; transform: none; }
.chips { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; line-height: 16px; letter-spacing: 0.005em; color: var(--idle-text); min-width: 0; }
.toggle { all: unset; box-sizing: border-box; display: flex; flex: none; align-items: center; gap: 6px; cursor: pointer; transition: transform 120ms ease; }
.toggle:active { transform: scale(0.98); }
.toggle:focus-visible { outline: 2px solid var(--active-text); outline-offset: 2px; }
.toggle svg { width: 13px; height: 13px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 200ms ease; }
.toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
.chip { flex: none; padding: 2px 6px; border: 1px solid var(--border); border-radius: 14px; background: var(--disc); }
.chip.mono { font-family: Menlo, ui-monospace, SFMono-Regular, monospace; color: var(--surface-text); }
.text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: italic; }
.a11y { margin: 0 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 16px; letter-spacing: 0.01em; color: var(--idle-text); }
.details { margin-bottom: 8px; }
.details[hidden] { display: none; }
.code { position: relative; margin-bottom: 8px; border-radius: var(--tip-radius); background: var(--active-bg); }
.code pre { margin: 0; max-height: 160px; overflow: auto; padding: 12px; font: 12px/16px Menlo, ui-monospace, SFMono-Regular, monospace; letter-spacing: 0.005em; white-space: pre; }
.code .copy { position: absolute; top: 4px; right: 4px; width: 28px; height: 28px; padding: 0; }
.css { max-height: 128px; overflow: auto; font: 12px/16px Menlo, ui-monospace, SFMono-Regular, monospace; letter-spacing: 0.005em; }
.css div { display: flex; gap: 6px; margin-bottom: 2px; }
.css .prop { flex: none; color: var(--idle-text); }
.css .val { min-width: 0; overflow-wrap: anywhere; }
textarea { all: unset; box-sizing: border-box; display: block; width: 100%; min-height: 80px; padding: 10px 14px; border: 1px solid var(--input-border); border-radius: 10px; background: var(--disc); color: var(--surface-text); font: 14px/20px var(--font); letter-spacing: 0; white-space: pre-wrap; resize: none; }
textarea::placeholder { color: var(--idle-text); }
textarea:focus-visible { border-color: var(--focus-border); outline: none; }
.error { margin: 8px 0 0; font-size: 12px; line-height: 16px; color: var(--destructive); }
.error[hidden] { display: none; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
button { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 999px; cursor: pointer; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; color: var(--idle-text); transition: transform 120ms ease; }
button:hover { background: var(--hover-bg); color: var(--hover-text); }
button:active { transform: scale(0.96); }
button:focus-visible { outline: 2px solid var(--active-text); outline-offset: 2px; }
button.primary { background: var(--primary); color: var(--primary-text); }
button.primary:hover { background: var(--primary); opacity: 0.9; color: var(--primary-text); }
button:disabled { opacity: 0.45; cursor: default; pointer-events: none; }
button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
`;

const CHEVRON = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6l-6 6"/></svg>';
const COPY_ICON =
  '<svg viewBox="0 0 24 24"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/></svg>';

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function div(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
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
  submitLabel: string;
  requireNote: boolean;
  onSubmit: (note: string) => Promise<string | null>;
  onCancel: () => void;
}): SelectionCard {
  const host = document.createElement("div");
  host.setAttribute("data-eva-annotate-overlay", "1");
  applyTheme(host, getTheme());
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;

  const card = div("card");

  const chips = div("chips");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Element details");
  toggle.innerHTML = CHEVRON;
  toggle.append(span("chip mono", info.chip));
  if (info.reactName) toggle.append(span("chip", info.reactName));
  chips.appendChild(toggle);
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

  const details = div("details");
  details.hidden = true;
  const code = div("code");
  const pre = document.createElement("pre");
  pre.textContent = info.html.replace(/></g, ">\n<");
  const copyHtml = document.createElement("button");
  copyHtml.type = "button";
  copyHtml.className = "copy";
  copyHtml.setAttribute("aria-label", "Copy HTML");
  copyHtml.innerHTML = COPY_ICON;
  copyHtml.addEventListener("click", () => {
    void navigator.clipboard.writeText(info.html).catch(() => {});
  });
  code.append(pre, copyHtml);
  details.appendChild(code);
  if (info.styles.length > 0) {
    const css = div("css");
    for (const line of info.styles) {
      const row = document.createElement("div");
      row.append(span("prop", `${line.prop}:`), span("val", line.value));
      css.appendChild(row);
    }
    details.appendChild(css);
  }
  card.appendChild(details);
  toggle.addEventListener("click", () => {
    const open = details.hidden;
    details.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    reposition(lastRect);
  });

  const field = document.createElement("textarea");
  field.placeholder = "What should Eva change?";
  field.setAttribute("aria-label", "Note for Eva");
  card.appendChild(field);

  const error = document.createElement("p");
  error.className = "error";
  error.hidden = true;
  const actions = div("actions");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const submitButton = document.createElement("button");
  submitButton.type = "button";
  submitButton.className = "primary";
  submitButton.textContent = submitLabel;
  actions.append(cancel, submitButton);
  card.append(error, actions);
  shadow.append(style, card);

  const syncEnabled = (): void => {
    submitButton.disabled = requireNote && field.value.trim() === "";
  };
  syncEnabled();
  field.addEventListener("input", syncEnabled);

  let lastRect = rect;
  function reposition(next: Rect): void {
    lastRect = next;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const maxLeft = window.innerWidth - width - GUTTER_PX;
    const left = Math.min(Math.max(GUTTER_PX, next.left), Math.max(GUTTER_PX, maxLeft));
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
    if (done || submitButton.disabled) return;
    submitButton.disabled = true;
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
  submitButton.addEventListener("click", submit);
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
  window.requestAnimationFrame(() => card.classList.add("in"));

  return {
    reposition,
    setHiddenForCapture(hidden) {
      host.style.visibility = hidden ? "hidden" : "";
    },
    close: finish,
  };
}
