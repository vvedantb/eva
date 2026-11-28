import { useState } from "react";

/**
 * The class that fades a page's content in when it replaces its loading
 * spinner, so the content does not pop in. Put it on the root of each loaded
 * branch (list, empty state). It is `undefined` when the data was already
 * there on the first render (a cached query): that content shows at once,
 * inside the page transition. "Disable page animations" stops the fade
 * (`.animate-in` in globals.css).
 */
export function useLoadedFade(loading: boolean): string | undefined {
  const [shownLoading, setShownLoading] = useState(loading);
  if (loading && !shownLoading) setShownLoading(true);
  return !loading && shownLoading
    ? "animate-in fade-in duration-300"
    : undefined;
}
