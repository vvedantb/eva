import type { HTMLMotionProps } from "motion/react";
import { tokenTransition } from "@vvedantb/ui";

/**
 * Spread on a kanban card's `m.div` wrapper (quick tasks, projects). When the
 * card's status changes it leaves one column and mounts in another with the
 * same `layoutId`, so motion glides it from its old place instead of jumping;
 * cards below a removed or added one slide into place too. The new column
 * clips the card while it travels, so it enters from that column's edge.
 * `null` turns the glide off (a card the user just dropped).
 */
export function kanbanCardGlide(
  id: string | null,
): Pick<HTMLMotionProps<"div">, "layout" | "layoutId" | "transition"> {
  if (id === null) return {};
  return {
    layout: "position",
    layoutId: `kanban-card-${id}`,
    transition: { layout: tokenTransition.slow },
  };
}
