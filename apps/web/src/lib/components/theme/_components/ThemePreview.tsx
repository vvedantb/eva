import { m, AnimatePresence } from "motion/react";
import { motionBase } from "@eva/ui";
import {
  FONT_FAMILIES,
  LETTER_SPACING_VALUES,
  lookupAccent,
} from "@/lib/contexts/themeTokens";
import type {
  AccentColor,
  RadiusSize,
  FontFamily,
  LetterSpacing,
} from "@/lib/contexts/ThemeContext";
import type { ThemeMode } from "@/lib/hooks/useThemeMode";
import { RADIUS_OPTIONS } from "./TypographySection";

export function ThemePreview({
  accentColor,
  radius,
  fontFamily,
  letterSpacing,
  currentMode,
}: {
  accentColor: AccentColor;
  radius: RadiusSize;
  fontFamily: FontFamily;
  letterSpacing: LetterSpacing;
  currentMode: ThemeMode;
}) {
  const radiusLabel =
    RADIUS_OPTIONS.find((r) => r.value === radius)?.label ?? radius;
  // Guarded because a stored accent can outlive the build that defined it —
  // see `lookupAccent` in ThemeContext, which also says how to unwind this.
  const accent = lookupAccent(accentColor);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={`${accentColor}-${radius}-${fontFamily}`}
        className="rounded-surface border border-border bg-muted/40 p-3 sm:p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={motionBase}
      >
        <div className="mb-4 flex items-start gap-2">
          <div
            className="mt-1 h-3 w-3 shrink-0 rounded-full bg-primary"
            style={
              accent === undefined
                ? undefined
                : { backgroundColor: accent.preview }
            }
          />
          <p className="text-xs sm:text-sm font-semibold text-foreground">
            {accent?.label ?? accentColor} &middot; {radiusLabel} radius
            &middot; {FONT_FAMILIES[fontFamily].label} &middot;{" "}
            {LETTER_SPACING_VALUES[letterSpacing].label} spacing &middot;{" "}
            {currentMode.charAt(0).toUpperCase() + currentMode.slice(1)} mode
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
            Primary button
          </button>
          <button className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            Secondary button
          </button>
          <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            Badge
          </span>
          <span className="text-xs text-muted-foreground">Muted text</span>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
