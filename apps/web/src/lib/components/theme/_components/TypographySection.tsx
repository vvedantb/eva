"use client";

import {
  FONT_FAMILIES,
  LETTER_SPACING_VALUES,
} from "@/lib/contexts/themeTokens";
import { preloadGoogleFontsForPicker } from "@/lib/contexts/googleFonts";
import type {
  RadiusSize,
  FontFamily,
  LetterSpacing,
} from "@/lib/contexts/ThemeContext";
import { IconCheck } from "@tabler/icons-react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { SectionLabel } from "./SectionLabel";
import { OptionButton } from "./OptionButton";

function isFontFamily(value: string): value is FontFamily {
  return value in FONT_FAMILIES;
}

const RADIUS_OPTIONS: { value: RadiusSize; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "X-Large" },
  { value: "full", label: "Full" },
];

const LETTER_SPACING_OPTIONS: { value: LetterSpacing; label: string }[] = [
  { value: "tighter", label: "Tighter" },
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
  { value: "wider", label: "Wider" },
];

export { RADIUS_OPTIONS };

export function TypographySection({
  fontFamily,
  onFontChange,
  letterSpacing,
  onLetterSpacingChange,
  radius,
  onRadiusChange,
}: {
  fontFamily: FontFamily;
  onFontChange: (f: FontFamily) => void;
  letterSpacing: LetterSpacing;
  onLetterSpacingChange: (ls: LetterSpacing) => void;
  radius: RadiusSize;
  onRadiusChange: (r: RadiusSize) => void;
}) {
  preloadGoogleFontsForPicker();
  return (
    // Three labelled sub-groups that read as one block, so the spacing lives
    // here rather than depending on the parent's stack.
    <div className="space-y-5">
      <section>
        <SectionLabel>Border Radius</SectionLabel>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {RADIUS_OPTIONS.map(({ value, label }, index) => {
            const previewRadius =
              value === "none"
                ? "0px"
                : value === "sm"
                  ? "3px"
                  : value === "md"
                    ? "6px"
                    : value === "lg"
                      ? "10px"
                      : value === "xl"
                        ? "14px"
                        : "9999px";

            return (
              <ListEnter
                key={value}
                index={index}
                fast
                slide={false}
                staggerMax={8}
              >
                <OptionButton
                  active={radius === value}
                  onClick={() => onRadiusChange(value)}
                >
                  <span
                    className="h-5 w-5 shrink-0 border-2 border-current"
                    style={{ borderRadius: previewRadius }}
                  />
                  {label}
                </OptionButton>
              </ListEnter>
            );
          })}
        </div>
      </section>

      <section>
        <SectionLabel>Font</SectionLabel>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {Object.entries(FONT_FAMILIES).map(([key, font], index) => {
            if (!isFontFamily(key)) return null;
            const isActive = fontFamily === key;
            return (
              <ListEnter
                key={key}
                index={index}
                fast
                slide={false}
                staggerMax={8}
              >
                <OptionButton
                  active={isActive}
                  onClick={() => onFontChange(key)}
                >
                  <IconCheck
                    size={14}
                    className={
                      isActive
                        ? "shrink-0 text-primary opacity-100"
                        : "shrink-0 text-primary opacity-0"
                    }
                    strokeWidth={2.5}
                    aria-hidden={!isActive}
                  />
                  <span style={{ fontFamily: font.stack }}>{font.label}</span>
                </OptionButton>
              </ListEnter>
            );
          })}
        </div>
      </section>

      <section>
        <SectionLabel>Font Spacing</SectionLabel>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {LETTER_SPACING_OPTIONS.map(({ value, label }, index) => (
            <ListEnter
              key={value}
              index={index}
              fast
              slide={false}
              staggerMax={8}
            >
              <OptionButton
                active={letterSpacing === value}
                onClick={() => onLetterSpacingChange(value)}
              >
                <span
                  className="text-xs font-semibold"
                  style={{
                    letterSpacing: LETTER_SPACING_VALUES[value].value,
                  }}
                >
                  Aa
                </span>
                {label}
              </OptionButton>
            </ListEnter>
          ))}
        </div>
      </section>
    </div>
  );
}
