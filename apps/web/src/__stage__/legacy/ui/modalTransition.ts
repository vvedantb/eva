const closeTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Cached because this used to run on every close, and `getComputedStyle`
 * forces a style flush right as the dialog starts moving. The token is a fixed
 * design value, so one read covers the session.
 */
let modalCloseMs: number | null = null;

function readModalCloseMs(): number {
  if (modalCloseMs !== null) {
    return modalCloseMs;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--modal-close-dur",
  );
  const parsed = parseFloat(raw);
  modalCloseMs = Number.isFinite(parsed) ? parsed : 150;
  return modalCloseMs;
}

function clearCloseTimer(el: HTMLElement): void {
  const timer = closeTimers.get(el);
  if (timer !== undefined) {
    clearTimeout(timer);
    closeTimers.delete(el);
  }
}

/** Open: scales up from --modal-scale. Clears any in-flight close cleanup. */
function openModalSurface(el: HTMLElement): void {
  clearCloseTimer(el);
  el.classList.remove("is-closing");
  el.classList.add("is-open");
}

/** Close: swap to .is-closing, remove after --modal-close-dur. */
function closeModalSurface(el: HTMLElement): void {
  clearCloseTimer(el);
  el.classList.remove("is-open");
  el.classList.add("is-closing");
  const closeMs = readModalCloseMs();
  const timer = setTimeout(() => {
    el.classList.remove("is-closing");
    closeTimers.delete(el);
  }, closeMs);
  closeTimers.set(el, timer);
}

/** First paint entrance — start at resting scale, then open on next frame. */
function primeModalSurface(el: HTMLElement): void {
  clearCloseTimer(el);
  el.classList.remove("is-open", "is-closing");
  requestAnimationFrame(() => {
    openModalSurface(el);
  });
}

/** Sync .is-open / .is-closing with Radix data-state on the same node. */
function syncModalSurfaceFromDataState(el: HTMLElement): void {
  const state = el.getAttribute("data-state");
  if (state === "open") {
    if (!el.classList.contains("is-open")) {
      primeModalSurface(el);
    } else {
      clearCloseTimer(el);
      el.classList.remove("is-closing");
    }
    return;
  }
  if (state === "closed" && el.classList.contains("is-open")) {
    closeModalSurface(el);
  }
}

function disconnectModalSurface(el: HTMLElement): void {
  clearCloseTimer(el);
}

/**
 * Wire Radix data-state → .is-open / .is-closing on the dialog surface.
 * Call from the content ref callback so portal-mounted nodes are never missed.
 */
export function connectModalSurface(el: HTMLElement): () => void {
  if (el.getAttribute("data-state") === "open") {
    primeModalSurface(el);
  }

  const observer = new MutationObserver(() => {
    syncModalSurfaceFromDataState(el);
  });
  observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });

  return () => {
    observer.disconnect();
    disconnectModalSurface(el);
  };
}
