"use client";

import { m, useSpring, useTransform } from "motion/react";

/** Furthest the eyes travel from rest, in px. */
const MAX_TRAVEL_PX = 3;
/** Cursor distance at which the eyes reach full travel. Closer reads as nearer. */
const FULL_TRAVEL_DISTANCE_PX = 160;
/** Sideways glances lean the eyes, like the reference's "slant" eyes. */
const MAX_SKEW_DEG = 14;
/**
 * Bouncy on purpose: the user's cursor drives this, so overshoot is feedback
 * to their gesture (see `motionSpring` for why non-gesture motion has none).
 */
const EYE_SPRING = { stiffness: 320, damping: 16, mass: 0.6 };

const EYE_CLASS = "h-[7px] w-[4px] rounded-full bg-zinc-900";

/**
 * Two eyes over Ave's star that follow the cursor anywhere on the page.
 * Absolutely positioned over whichever disc hosts it.
 *
 * The pointer listener writes motion values, never React state, so tracking
 * costs no renders. It lives in a ref callback because the window listener
 * has to follow this node's lifetime; the rect is read per move because the
 * launcher can be dragged.
 */
export function AveEyes() {
  const x = useSpring(0, EYE_SPRING);
  const y = useSpring(0, EYE_SPRING);
  const skewX = useTransform(
    x,
    [-MAX_TRAVEL_PX, MAX_TRAVEL_PX],
    [MAX_SKEW_DEG, -MAX_SKEW_DEG],
  );

  return (
    <span
      ref={(node) => {
        if (!node) return;
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
      <m.span className="flex gap-[5px]" style={{ x, y, skewX }}>
        <span className={EYE_CLASS} />
        <span className={EYE_CLASS} />
      </m.span>
    </span>
  );
}
