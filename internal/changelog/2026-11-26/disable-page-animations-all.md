# Disable page animations: no animation anywhere

- With the experimental "Disable page animations" flag on, every web animation and transition is now instant, including fades.
- Only loading indicators (spinners, shimmer, skeleton pulse) still move.

Architectural: Motion's `reducedMotion: "always"` keeps opacity fades, so `PageMotionProvider` also sets `MotionGlobalConfig.instantAnimations`. The CSS class list in `globals.css` is now one rule on every element that sets animation and transition durations to 0s (end events still fire for Radix Presence).
