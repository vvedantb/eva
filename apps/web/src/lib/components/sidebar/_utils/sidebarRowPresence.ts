import type { HTMLMotionProps } from "motion/react";
import { tokenTransition } from "@vvedantb/ui";

/**
 * Enter and leave motion for a sidebar list row (sessions, automations,
 * reviews), spread on the row's `m.div` inside an `AnimatePresence`. A new row
 * opens its height and slides 8px up into the list; an archived or deleted row
 * folds its height away, so the rows below close the gap instead of jumping.
 * The row clips only while it moves: at rest its focus ring and hover card
 * stay visible.
 */
export const sidebarRowPresence: Pick<
  HTMLMotionProps<"div">,
  "initial" | "animate" | "exit" | "transition"
> = {
  initial: { opacity: 0, height: 0, y: 8, overflow: "hidden" },
  animate: {
    opacity: 1,
    height: "auto",
    y: 0,
    transitionEnd: { overflow: "visible" },
  },
  exit: { opacity: 0, height: 0, overflow: "hidden" },
  transition: tokenTransition.base,
};
