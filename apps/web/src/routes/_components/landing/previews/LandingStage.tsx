import { useSyncExternalStore, type ReactNode } from "react";
import {
  Stage,
  type Act,
  type Layout,
  type Rect,
  type Target,
} from "@/lib/stageshow";
import "./landingStage.css";

const WIDE = { width: 660, height: 400 } as const;
const COMPACT = { below: 560, width: 358, height: 440 } as const;

const VEIL_MS = 280;

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
  onEnd?: () => void;
}

interface LandingStageProps<S extends object> extends LandingDemoProps {
  className: string;
  initial: S;
  poster: S;
  story: (a: Act<S>) => Promise<void>;
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
