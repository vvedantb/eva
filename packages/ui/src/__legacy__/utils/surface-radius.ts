/**
 * Radius utilities for theme-aware corners. "Full" sets --radius to 9999px.
 *
 * - Compact single-line rows that should stay pills on "Full": use `rounded-lg`
 *   (maps to var(--radius)).
 * - Menu / nav rows: `rounded-menu-item` (capped at 8px).
 * - Controls: `rounded-control` (capped at 10px).
 * - Wide / multi-line surfaces (modals, dropdown panels, cards):
 *   `rounded-surface` (clamped 12–16px) so they do not become ovals.
 *
 * Uses globals.css utilities for capped tokens — not Tailwind arbitrary values
 * — so class extraction never drops commas inside clamp().
 */

/** Cards, dialogs, dropdown panels, kanban columns, alerts, calendars. */
export const SURFACE_RADIUS_CLASS = "rounded-surface";

/** Inputs, textareas, selects, input groups. */
export const CONTROL_RADIUS_CLASS = "rounded-control";
