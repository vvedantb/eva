"use client";

import { useState } from "react";
import { m, useSpring, useTransform } from "motion/react";
import { cn } from "@eva/ui";
import type { AveLogoState } from "@/lib/components/ave/aveLogoState";

/** Furthest the eyes travel from rest, in px. */
const MAX_TRAVEL_PX = 4;
/** Cursor distance at which the eyes reach full travel. Closer reads as nearer. */
const FULL_TRAVEL_DISTANCE_PX = 160;
/** Sideways glances lean the eyes, like the reference's "slant" eyes. */
const MAX_SKEW_DEG = 14;
/**
 * Bouncy on purpose: the user's cursor drives this, so overshoot is feedback
 * to their gesture (see `motionSpring` for why non-gesture motion has none).
 */
const EYE_SPRING = { stiffness: 320, damping: 16, mass: 0.6 };

/** `bg-foreground` turns light in dark themes; zinc-900 vanished on the dark card. */
const EYE_CLASS = "h-[10px] w-[6px] rounded-full bg-foreground";

/**
 * `ave-blink` closes the eyes twice per period, 44% and 56% of it apart, so a
 * 7–9s period gives irregular 3–5s gaps between blinks.
 */
function randomBlinkPeriod() {
  return `${7 + Math.random() * 2}s`;
}

/**
 * Two eyes over Ave's star that follow the cursor anywhere on the page.
 * Absolutely positioned over whichever disc hosts it.
 *
 * The pointer listener writes motion values, never React state, so tracking
 * costs no renders. It lives in a ref callback because the window listener
 * has to follow this node's lifetime; the rect is read per move because the
 * launcher can be dragged.
 *
 * Only idle follows the cursor. Every other state recentres the spring and
 * lets its own pose (`.ave-look` / `.ave-open` in globals.css) move the eyes,
 * so the two motions never stack.
 */
export function AveEyes({ state }: { state: AveLogoState }) {
  const x = useSpring(0, EYE_SPRING);
  const y = useSpring(0, EYE_SPRING);
  const skewX = useTransform(
    x,
    [-MAX_TRAVEL_PX, MAX_TRAVEL_PX],
    [MAX_SKEW_DEG, -MAX_SKEW_DEG],
  );
  // Fixed per mount: the irregular gaps come from the keyframes.
  const [blinkPeriod] = useState(randomBlinkPeriod);
  const followsCursor = state === "idle";

  return (
    <span
      ref={(node) => {
        if (!node) return;
        if (!followsCursor) {
          x.set(0);
          y.set(0);
          return;
        }
        const onPointerMove = (event: PointerEvent) => {
          const rect = node.getBoundingClientRect();
          const dx = event.clientX - (rect.left + rect.width / 2);
          const dy = event.clientY - (rect.top + rect.height / 2);
          const distance = Math.hypot(dx, dy);
          if (distance === 0) {
            x.set(0);
            y.set(0);
            return;
          }
          const travel =
            MAX_TRAVEL_PX * Math.min(1, distance / FULL_TRAVEL_DISTANCE_PX);
          x.set((dx / distance) * travel);
          y.set((dy / distance) * travel);
        };
        window.addEventListener("pointermove", onPointerMove, {
          passive: true,
        });
        return () =>
          window.removeEventListener("pointermove", onPointerMove);
      }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <m.span className="flex" style={{ x, y, skewX }}>
        <span className="ave-look relative flex">
          <span className="ave-open flex gap-[6px]">
            <span
              className={cn(EYE_CLASS, "ave-eye ave-eye-l")}
              style={{ animationDuration: blinkPeriod }}
            />
            <span
              className={cn(EYE_CLASS, "ave-eye ave-eye-r")}
              style={{ animationDuration: blinkPeriod }}
            />
          </span>
          {state === "done" && (
            // Happy squint arcs over the 18×10 eye row, one per eye centre.
            <svg
              viewBox="0 0 18 10"
              className="ave-happy absolute inset-0 size-full overflow-visible"
            >
              <path
                d="M0.4 6.2Q3 2.2 5.6 6.2M12.4 6.2Q15 2.2 17.6 6.2"
                fill="none"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </m.span>
    </span>
  );
}
