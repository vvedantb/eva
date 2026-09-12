"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Page-visibility and on-screen budget for infinite animations.
 *
 * CSS animations pause via `html[data-page-hidden]` / `[data-anim-offscreen]`
 * in the host stylesheet. WAAPI (Spinner, LoadingState) has no CSS play-state
 * hook, so {@link bindRuntimeAnimation} pauses those directly.
 *
 * Pausing is visually identical while the user is looking: playback resumes
 * from the same offset when the tab or element is shown again.
 */

type IntersectionListener = (intersecting: boolean) => void;

const intersectionListeners = new WeakMap<Element, Set<IntersectionListener>>();
let sharedObserver: IntersectionObserver | null = null;
let pageVisibilityStarted = false;

function pageIsHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.removeAttribute("data-anim-offscreen");
        } else {
          entry.target.setAttribute("data-anim-offscreen", "");
        }
        const listeners = intersectionListeners.get(entry.target);
        if (!listeners) continue;
        for (const listener of listeners) listener(entry.isIntersecting);
      }
    },
    // Keep a small lead so a scroll into view does not show a frozen frame.
    { rootMargin: "64px", threshold: 0 },
  );
  return sharedObserver;
}

/** Sets `html[data-page-hidden]` so CSS can pause compositor animations. */
export function ensureRuntimeVisibility(): void {
  if (pageVisibilityStarted || typeof document === "undefined") return;
  pageVisibilityStarted = true;
  const sync = () => {
    document.documentElement.toggleAttribute("data-page-hidden", pageIsHidden());
  };
  sync();
  document.addEventListener("visibilitychange", sync);
}

/**
 * Marks `el` with `data-anim-offscreen` when it leaves the viewport and
 * optionally notifies. Shared observer — many cells/spinners cost one IO.
 */
export function observeAnimVisibility(
  el: Element,
  onChange?: IntersectionListener,
): () => void {
  ensureRuntimeVisibility();
  const observer = getSharedObserver();
  if (!observer) return () => {};
  let listeners = intersectionListeners.get(el);
  if (!listeners) {
    listeners = new Set();
    intersectionListeners.set(el, listeners);
    observer.observe(el);
  }
  if (onChange) listeners.add(onChange);
  return () => {
    if (onChange) listeners?.delete(onChange);
    if (listeners && listeners.size === 0) {
      observer.unobserve(el);
      intersectionListeners.delete(el);
      el.removeAttribute("data-anim-offscreen");
    }
  };
}

/** Callback ref that applies {@link observeAnimVisibility} to the node. */
export function useAnimOffscreenRef<T extends Element>(): (
  node: T | null,
) => void {
  const cleanupRef = useRef<(() => void) | null>(null);
  const setRef = useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = node ? observeAnimVisibility(node) : null;
  }, []);
  useEffect(() => () => cleanupRef.current?.(), []);
  return setRef;
}

/**
 * Play a WAAPI loop only while the page is visible and `el` is on screen.
 * Returns a detach cleanup that also cancels the animation.
 */
export function bindRuntimeAnimation(
  el: Element,
  animation: Animation,
): () => void {
  ensureRuntimeVisibility();
  let intersecting = true;
  const sync = () => {
    const hidden = pageIsHidden() || !intersecting;
    if (hidden) {
      if (animation.playState === "running") animation.pause();
      return;
    }
    if (animation.playState === "paused") animation.play();
  };
  const unobserve = observeAnimVisibility(el, (next) => {
    intersecting = next;
    sync();
  });
  const onVisibility = () => sync();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  sync();
  return () => {
    unobserve();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    animation.cancel();
  };
}
