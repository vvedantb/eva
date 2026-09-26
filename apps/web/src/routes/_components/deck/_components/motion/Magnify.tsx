import { Children, isValidElement } from "react";
import type { ReactNode } from "react";
import { m } from "motion/react";
import { SETTLE } from "./tokens";

export interface MagnifyProps {
  /** The set. Each direct child becomes one magnifiable item. */
  children: ReactNode;
  /** Index of the child to lift, or `null` for everyone at rest. Usually derived from the step. */
  focus: number | null;
  /** Scale of the focused item. Keep it under 1.12 so neighbours are not covered. */
  scale?: number;
  /** Opacity the other items drop to. */
  dimTo?: number;
  /** Put the layout here (`flex gap-4`, `grid grid-cols-4 gap-6`). */
  className?: string;
}

/**
 * "One of many": the focused item scales up and lifts towards the viewer while
 * its siblings recede and dim. Transform and opacity only, on a critically
 * damped spring, so the focus can hop between items step by step.
 *
 * @example <Magnify focus={step >= 2 ? 1 : null} className="grid grid-cols-4 gap-6">{cards}</Magnify>
 */
export function Magnify({
  children,
  focus,
  scale = 1.07,
  dimTo = 0.35,
  className,
}: MagnifyProps) {
  return (
    <div className={className}>
      {Children.toArray(children).map((child, index) => {
        const state =
          focus === null ? "rest" : focus === index ? "lifted" : "receded";
        return (
          <m.div
            key={isValidElement(child) && child.key !== null ? child.key : index}
            className="relative"
            style={{ zIndex: state === "lifted" ? 1 : 0 }}
            initial={false}
            animate={
              state === "lifted"
                ? { scale, y: -10, opacity: 1 }
                : state === "receded"
                  ? { scale: 0.97, y: 4, opacity: dimTo }
                  : { scale: 1, y: 0, opacity: 1 }
            }
            transition={SETTLE}
          >
            {child}
          </m.div>
        );
      })}
    </div>
  );
}
