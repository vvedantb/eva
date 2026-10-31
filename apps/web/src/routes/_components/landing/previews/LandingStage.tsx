import { useSyncExternalStore, type ReactNode } from "react";
import {
  Stage,
  type Act,
  type Layout,
  type Rect,
  type Target,
} from "@/lib/stageshow";
import "./landingStage.css";

/**
 * Design sizes for every landing demo, so the showcase panel never changes size
 * between tabs. Wide fits the showcase's preview column at 1:1 (about 666px at
 * the widest page); below 560px of container the stage swaps to a compact
 * design built for a phone column, not the wide one shrunk.
 */
const WIDE = { width: 660, height: 400 } as const;
const COMPACT = { below: 560, width: 358, height: 440 } as const;

/** How long the loop seam's fade takes each way; matches `landingStage.css`. */
const VEIL_MS = 280;

/**
 * The page's light or dark appearance, read from the `dark` class on `<html>`.
 *
 * Not `useThemeMode()`: the signed-out landing skips `ClientProvider`, so there
 * is no `ThemeModeProvider` and the context default is always "light", while
 * the boot script in `index.html` has already set the class from the visitor's
 * stored preference or OS setting. The class is the one source both pages share.
 */
function subscribeToAppearance(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function readAppearance(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function readServerAppearance(): "light" | "dark" {
  return "light";
}

function useDocumentAppearance(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeToAppearance,
    readAppearance,
    readServerAppearance,
  );
}

/** Props every landing demo takes from the showcase. */
export interface LandingDemoProps {
  /**
   * Called once per run, when the story's payoff has held. The showcase uses it
   * to move to the next tab; the seam that follows only plays when nobody
   * advances (a tab the visitor picked loops).
   */
  onEnd?: () => void;
}

interface LandingStageProps<S extends object> extends LandingDemoProps {
  /** Demo root class; scope the demo's CSS under it. */
  className: string;
  initial: S;
  /** The still for reduced motion and thumbnails: the payoff, settled. */
  poster: S;
  /** The beats, up to and including the payoff's hold. */
  story: (a: Act<S>) => Promise<void>;
  /** Cursor rest point. Leave out for a demo with no pointer. */
  cursor?: { wide: Target; compact: Target };
  children: (
    state: S,
    rect: (name: string) => Rect,
    layout: Layout,
  ) => ReactNode;
}

/**
 * A Stageshow stage set up for the landing page: the shared sizes, Eva's design
 * tokens (`landingStage.css`), the visitor's light or dark theme, and one loop
 * seam for all of them.
 *
 * The seam is a cut, not a rewind: the cursor goes back to its rest point, the
 * scene fades out (`data-mark="veil"`), state snaps to `initial` while hidden,
 * and the opening frame fades back. "Data never rewinds in view" — a fixed bug
 * reappearing on screen would read as a regression.
 */
export function LandingStage<S extends object>({
  className,
  initial,
  poster,
  story,
  cursor,
  onEnd,
  children,
}: LandingStageProps<S>) {
  const theme = useDocumentAppearance();

  // The stage restarts whenever `script` changes identity; the compiler keeps
  // this stable for as long as `story` and `onEnd` are.
  const script = async (a: Act<S>) => {
    await story(a);
    onEnd?.();
    if (cursor) await a.move(cursor[a.layout]);
    a.mark("veil");
    await a.wait(VEIL_MS);
    await a.snap(initial);
    a.mark("open");
    await a.wait(VEIL_MS + 200);
  };

  return (
    <Stage
      width={WIDE.width}
      height={WIDE.height}
      compact={COMPACT}
      initial={initial}
      poster={poster}
      script={script}
      cursor={cursor ? { at: cursor, ripple: true } : undefined}
      theme={theme}
      className={`landing-stage ${className}`}
    >
      {(state, rect, layout) => (
        <div className="landing-stage__scene">
          {children(state, rect, layout)}
        </div>
      )}
    </Stage>
  );
}
