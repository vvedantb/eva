"use client";

import { useState, type ReactNode } from "react";
import { IconCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn, motionSlow } from "@eva/ui";
import type { LandingFeature } from "./landingContent";
import { LANDING_PREVIEWS } from "./previews";

/** How long each tab holds before the showcase moves to the next one. */
const AUTO_ADVANCE_SECONDS = 4;

interface ShowcaseState {
  index: number;
  /** Cleared for good once the visitor picks a tab themselves. */
  auto: boolean;
  /** Whether the showcase is on screen — timers should not run out of sight. */
  visible: boolean;
}

/**
 * A pillar's features as a tab strip over a live mock panel.
 *
 * The countdown is the progress bar itself: it animates across the active tab
 * over `AUTO_ADVANCE_SECONDS` and advances the index when it lands, so there is
 * no interval to keep in sync with what is drawn. Auto-advance stops when the
 * strip scrolls out of view, and permanently once they choose a tab — nothing should slide out from under
 * someone who is reading it.
 *
 * Each tab carries `group` so the animated sidebar icons play the same hover
 * animation here as they do in the app: the keyframes in
 * `@vvedantb/ui/tokens/css/nav-icons.css` are all scoped to `.group:hover .vv-icon`.
 */
export function LandingShowcase({
  idPrefix,
  features,
}: {
  idPrefix: string;
  features: readonly LandingFeature[];
}) {
  const [tab, setTab] = useState<ShowcaseState>({
    index: 0,
    auto: true,
    visible: false,
  });

  const active = features[tab.index];
  if (!active) return null;

  const autoRunning = tab.auto && tab.visible;
  const Preview = LANDING_PREVIEWS[active.preview];

  const advance = () => {
    setTab((current) => ({
      ...current,
      index: (current.index + 1) % features.length,
    }));
  };

  return (
    <m.div
      className="mt-14 rounded-surface bg-muted/50 p-2 sm:p-3"
      viewport={{ amount: 0.25 }}
      onViewportEnter={() => {
        setTab((current) =>
          current.visible ? current : { ...current, visible: true },
        );
      }}
      onViewportLeave={() => {
        setTab((current) =>
          current.visible ? { ...current, visible: false } : current,
        );
      }}
    >
      <div
        role="tablist"
        aria-label="Features"
        className="flex flex-wrap gap-1 p-1"
      >
        {features.map((feature, index) => {
          const Icon = feature.icon;
          const isActive = index === tab.index;

          return (
            <button
              key={feature.name}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${feature.preview}`}
              aria-selected={isActive}
              aria-controls={`${idPrefix}-panel`}
              onClick={() => {
                setTab({ index, auto: false, visible: true });
              }}
              className={cn(
                "motion-base motion-press group relative flex items-center gap-2 overflow-hidden rounded-full px-3.5 py-2 text-sm font-medium active:scale-[0.97]",
                isActive
                  ? "bg-background text-foreground smooth-shadow-ring-xs"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon
                size={15}
                className={cn(
                  "motion-base shrink-0",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              />
              {feature.name}
              {isActive ? (
                <TabUnderline
                  countdownKey={tab.index}
                  running={autoRunning}
                  onComplete={advance}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${active.preview}`}
        className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]"
      >
        <SwapIn
          swapKey={`copy-${active.preview}`}
          className="flex h-full flex-col rounded-surface bg-card p-6 sm:p-8"
        >
          <h3 className="landing-display text-2xl font-semibold text-foreground">
            {active.name}
          </h3>
          <p className="mt-2 text-pretty text-base leading-relaxed text-muted-foreground">
            {active.summary}
          </p>
          <ul className="mt-8 space-y-3.5">
            {active.points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <IconCheck size={12} className="text-primary" aria-hidden />
                </span>
                <span className="text-pretty text-sm leading-relaxed text-foreground/85">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </SwapIn>

        <SwapIn swapKey={`preview-${active.preview}`}>
          <Preview />
        </SwapIn>
      </div>
    </m.div>
  );
}

/**
 * The active tab's underline. While the showcase is cycling this is a countdown
 * that reports back when it finishes; otherwise it is a plain marker. They are
 * separate branches because remounting is what restarts the countdown.
 */
function TabUnderline({
  countdownKey,
  running,
  onComplete,
}: {
  countdownKey: number;
  running: boolean;
  onComplete: () => void;
}) {
  if (!running) {
    return (
      <span
        aria-hidden
        className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary/40"
      />
    );
  }

  return (
    <m.span
      key={countdownKey}
      aria-hidden
      className="absolute inset-x-3 bottom-0 h-0.5 origin-left rounded-full bg-primary"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: AUTO_ADVANCE_SECONDS, ease: "linear" }}
      onAnimationComplete={onComplete}
    />
  );
}

/** Fades new panel content in on tab change. Keyed, so it replays each swap. */
function SwapIn({
  swapKey,
  className,
  children,
}: {
  swapKey: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <m.div
      key={swapKey}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionSlow}
    >
      {children}
    </m.div>
  );
}
