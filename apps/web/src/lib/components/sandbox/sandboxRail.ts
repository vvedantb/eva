/** Desktop sandbox icon rail width. The right panel collapses to this, not 0. */
export const SANDBOX_RAIL_WIDTH_PX = 44;

/**
 * The same rail with a label under each icon (`useSandboxRailLabels`). Kept in
 * step by hand with the `md:w-[76px]` the bar renders — Tailwind needs a
 * literal — so change both together.
 */
export const SANDBOX_RAIL_LABELLED_WIDTH_PX = 76;

/**
 * A group of sandbox rail buttons (collapse toggle, tools) on the same trough
 * as the tab list and the app rail groups (`rail-track` in globals.css).
 * `p-0.5` keeps the 32px buttons inside the 44px rail.
 */
export const SANDBOX_RAIL_GROUP_CLASS =
  "rail-track flex shrink-0 items-center gap-1 rounded-xl p-0.5 md:flex-col";
