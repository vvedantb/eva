// Migration scaffolding: renders an @eva/ui component and its @vvedantb/ui
// replacement (under eva's UiConfig) and compares the DOM they produce.
// Deleted together with the legacy components once the move is done.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UiConfigProvider, type UiConfig } from "@vvedantb/ui";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function unmount() {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  for (const name of document.body.getAttributeNames()) document.body.removeAttribute(name);
  root = null;
}

/** React `useId` values (`«r1»`, `:r1:`, `_r_1_`), also inside Radix `radix-…` ids. */
const REACT_ID = /«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g;

/** `document.body` as one tag per line, ids numbered by first use, class tokens sorted. */
function serialise(): string {
  const ids = new Map<string, string>();
  for (const el of document.body.querySelectorAll("[class]")) {
    const sorted = [...el.classList].sort().join(" ");
    el.setAttribute("class", sorted);
  }
  return document.body.innerHTML
    .replace(REACT_ID, (id) => {
      const known = ids.get(id);
      if (known) return known;
      const next = `«id${ids.size}»`;
      ids.set(id, next);
      return next;
    })
    .replace(/></g, ">\n<");
}

/** Mounts `node` in a fresh root, waits a tick, and returns the normalised body. */
export async function render(node: ReactNode, interact?: () => Promise<void> | void): Promise<string> {
  await unmount();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created;
  await act(async () => created.render(node));
  await flush();
  if (interact) {
    await act(async () => {
      await interact();
    });
    await flush();
  }
  const html = serialise();
  await unmount();
  return html;
}

/** Renders the legacy node, then the vvedantb node under `config`. */
export async function renderPair(
  legacy: ReactNode,
  next: ReactNode,
  config: UiConfig,
  interact?: () => Promise<void> | void,
): Promise<{ legacy: string; next: string }> {
  const before = await render(legacy, interact);
  const after = await render(<UiConfigProvider config={config}>{next}</UiConfigProvider>, interact);
  return { legacy: before, next: after };
}
