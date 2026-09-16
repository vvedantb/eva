import { useEffect, useSyncExternalStore } from "react";
import { useMatches } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Section label for the browser tab, e.g. `"Projects"` → "Projects | Eva". */
    title?: string;
  }
}

/** Shown on routes that declare no title (landing page, auth callbacks). */
const FALLBACK_TITLE = "Eva - Your New Coworker";

// Module-level store for the two pieces of tab state that no route owns: the
// open entity's name (published by whichever detail view is on screen) and the
// unread count (published by FaviconController, the one place already syncing
// that number to document-level state). Both are read through
// `useSyncExternalStore` so a publish re-renders only the title hook.
let entityTitle: string | null = null;
let unreadCount = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function readEntityTitle(): string | null {
  return entityTitle;
}

function readUnreadCount(): number {
  return unreadCount;
}

/**
 * Names the entity the user has open (session, project, task, doc, PR,
 * automation). Pass `null` to clear. Prefer {@link useEntityDocumentTitle},
 * which clears on unmount for you.
 */
export function setEntityDocumentTitle(title: string | null) {
  if (entityTitle === title) return;
  entityTitle = title;
  notify();
}

/** Mirrors the notification badge into the tab title, e.g. "(3) …". */
export function setDocumentUnreadCount(count: number) {
  if (unreadCount === count) return;
  unreadCount = count;
  notify();
}

/**
 * Builds the tab title from its three independent inputs. Pure, so the
 * ordering rules ("(3) Fix login · Sessions | Eva") are testable without a DOM.
 */
export function composeDocumentTitle({
  section,
  entity,
  unread,
}: {
  /** Route label from `staticData.title`, e.g. "Sessions". */
  section: string | null;
  /** Open entity's name, e.g. a session title. */
  entity: string | null;
  unread: number;
}): string {
  // Nothing to name: landing page and auth callbacks, where a count would be
  // meaningless anyway (the query behind it is skipped while signed out).
  if (entity === null && section === null) return FALLBACK_TITLE;

  const count = unread > 0 ? `(${unread}) ` : "";
  const parts: string[] = [];
  if (entity !== null) parts.push(entity);
  if (section !== null) parts.push(section);
  return `${count}${parts.join(" · ")} | Eva`;
}

/**
 * Keeps the browser tab title in sync with the active route, the open entity
 * and the unread count.
 *
 * Routes declare their label via `staticData: { title: "Projects" }`. The
 * deepest match with a title wins, so a nested route can override the label it
 * would otherwise inherit from its parent layout. Called once from the root
 * route so every navigation — including ones that never unmount the shell —
 * updates the tab.
 */
export function useDocumentTitle() {
  const section = useMatches({
    select: (matches) =>
      matches.reduce<string | null>(
        (deepest, match) => match.staticData.title ?? deepest,
        null,
      ),
  });
  const entity = useSyncExternalStore(
    subscribe,
    readEntityTitle,
    readEntityTitle,
  );
  const unread = useSyncExternalStore(
    subscribe,
    readUnreadCount,
    readUnreadCount,
  );

  const title = composeDocumentTitle({ section, entity, unread });

  useEffect(() => {
    document.title = title;
  }, [title]);
}

/**
 * Publishes the open entity's name to the tab title while mounted, clearing it
 * on unmount. `document.title` is external state no React tree owns, which is
 * why the effect lives here rather than being pushed into render.
 *
 * `enabled` exists because up to three session shells stay mounted (hidden) at
 * once — see `sessions/route.tsx`. Only the one matching the URL may publish,
 * or a background session would name the tab.
 */
export function useEntityDocumentTitle(
  title: string | null | undefined,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || title === null || title === undefined) return;
    setEntityDocumentTitle(title);
    return () => {
      setEntityDocumentTitle(null);
    };
  }, [title, enabled]);
}
