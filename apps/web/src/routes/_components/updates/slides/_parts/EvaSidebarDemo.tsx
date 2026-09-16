import { AnimatePresence, m } from "motion/react";
import { EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";
import { EvaRail } from "./EvaSidebarRail";
import {
  EvaNavRow,
  EvaSessionRow,
  EvaSidebarGroupLabel,
  NAV_GROUPS,
  SESSION_ROWS,
  TOP_NAV,
} from "./EvaSidebarNav";

/** The step at which the deck switches the demo into Simple Mode. */
const SIMPLE_STEP = 2;

/** Window size on the slide, and the app-sized surface drawn inside it. */
const WINDOW_WIDTH = 500;
const WINDOW_HEIGHT = 350;
const TITLE_BAR = 36;
const SURFACE_WIDTH = 868;
const SURFACE_HEIGHT = 545;
const SCALE = (WINDOW_HEIGHT - TITLE_BAR) / SURFACE_HEIGHT;

/** The repo panel: workspace shortcuts, sessions, then Ship / Test / More. */
function EvaNavPanel({ simple }: { simple: boolean }) {
  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-11 items-center gap-2 px-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-500 text-sm font-semibold text-white">
          C
        </span>
        <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.02em] text-sidebar-primary">
          carepulse-ts
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-2 py-2">
        <div className="space-y-1">
          {TOP_NAV.map((item, index) => (
            <EvaNavRow key={item.name} item={item} index={index} />
          ))}
        </div>
        <div>
          <EvaSidebarGroupLabel label="Sessions" />
          <div className="space-y-1">
            {SESSION_ROWS.map((row) => (
              <EvaSessionRow key={row.title} row={row} />
            ))}
          </div>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <EvaSidebarGroupLabel label={group.label} />
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {group.items
                  .filter((item) => !(simple && item.simpleHidden === true))
                  .map((item, index) => (
                    <EvaNavRow key={item.name} item={item} index={index} />
                  ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WindowTitle({ simple }: { simple: boolean }) {
  return (
    <div className="relative h-4 flex-1">
      <AnimatePresence initial={false}>
        <m.div
          key={simple ? "simple" : "repo"}
          className="absolute inset-0 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        >
          <span className="text-xs text-white/55">
            {simple ? "Eva · Simple Mode" : "Eva · carepulse-ts"}
          </span>
          {simple ? (
            <span className="rounded-full bg-white/15 px-2 text-[10px] leading-4 text-white/80">
              Simple Mode
            </span>
          ) : null}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Eva's own sidebar, drawn with the app's icons and classes, inside a window
 * frame. At `SIMPLE_STEP` the rows Simple Mode really hides collapse away.
 */
export function EvaSidebarDemo() {
  const simple = useDeckStep() >= SIMPLE_STEP;

  return (
    <div
      className="overflow-hidden rounded-2xl bg-white/[0.06]"
      style={{ width: WINDOW_WIDTH, height: WINDOW_HEIGHT }}
    >
      <div
        className="flex items-center gap-2 border-b border-white/[0.06] px-4"
        style={{ height: TITLE_BAR }}
      >
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <div className="ml-3 flex-1">
          <WindowTitle simple={simple} />
        </div>
      </div>

      <div
        className="overflow-hidden"
        style={{ height: WINDOW_HEIGHT - TITLE_BAR }}
      >
        <div
          className="dark flex origin-top-left bg-background"
          style={{
            width: SURFACE_WIDTH,
            height: SURFACE_HEIGHT,
            transform: `scale(${SCALE})`,
          }}
        >
          <EvaRail simple={simple} />
          <EvaNavPanel simple={simple} />
          {/* The main area is off-frame: fade it out rather than show a mock. */}
          <div
            className="flex-1 bg-background"
            style={{
              maskImage:
                "linear-gradient(to right, black 0%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, black 0%, transparent 100%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
