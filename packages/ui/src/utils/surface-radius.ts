/**

 * Radius utilities for theme-aware corners. "Full" sets --radius to 9999px.

 *

 * - Compact single-line rows (sidebar nav, list rows): use `rounded-lg` (maps to

 *   var(--radius)) so "Full" renders as pills — that is intentional.

 * - Wide / multi-line surfaces (modals, dropdown panels, cards): use capped tokens

 *   below so they do not become ovals.

 *

 * Uses globals.css utilities for capped tokens — not Tailwind arbitrary values —

 * so class extraction never drops commas inside clamp().

 */

/** Cards, dialogs, dropdown panels, kanban columns, alerts, calendars. */

export const SURFACE_RADIUS_CLASS = "rounded-surface";

/** Inputs, textareas, selects, input groups. */

export const CONTROL_RADIUS_CLASS = "rounded-control";
