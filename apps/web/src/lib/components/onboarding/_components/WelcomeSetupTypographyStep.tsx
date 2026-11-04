"use client";

import { Button } from "@vvedantb/ui";
import { IconArrowRight } from "@tabler/icons-react";
import { TypographySection } from "@/lib/components/theme/_components/TypographySection";
import type {
  FontFamily,
  LetterSpacing,
  RadiusSize,
} from "@/lib/contexts/ThemeContext";

interface WelcomeSetupTypographyStepProps {
  fontFamily: FontFamily;
  letterSpacing: LetterSpacing;
  radius: RadiusSize;
  onFontChange: (font: FontFamily) => void;
  onLetterSpacingChange: (spacing: LetterSpacing) => void;
  onRadiusChange: (radius: RadiusSize) => void;
  onOpenThemeSettings: () => void;
}

export function WelcomeSetupTypographyStep({
  fontFamily,
  letterSpacing,
  radius,
  onFontChange,
  onLetterSpacingChange,
  onRadiusChange,
  onOpenThemeSettings,
}: WelcomeSetupTypographyStepProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Adjust type and corner radius, or open Theme settings for presets and a
        live preview.
      </p>
      <div className="space-y-6">
        <TypographySection
          fontFamily={fontFamily}
          onFontChange={onFontChange}
          letterSpacing={letterSpacing}
          onLetterSpacingChange={onLetterSpacingChange}
          radius={radius}
          onRadiusChange={onRadiusChange}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-auto gap-1.5 px-0 text-sm text-primary hover:bg-transparent hover:text-primary/80"
        onClick={onOpenThemeSettings}
      >
        More theme options in settings
        <IconArrowRight size={14} />
      </Button>
    </div>
  );
}
