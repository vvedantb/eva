"use client";

import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { useThemeContext } from "@/lib/contexts/useThemeContext";
import { resolveCustomTheme } from "@/lib/contexts/themeTokens";
import type {
  AccentColor,
  CustomTheme,
  RadiusSize,
  FontFamily,
  LetterSpacing,
} from "@/lib/contexts/ThemeContext";
import { Spinner, SettingsSection, ThemeModePicker } from "@vvedantb/ui";
import { PresetsSection } from "./_components/PresetsSection";
import { AccentColorSection } from "./_components/AccentColorSection";
import { TypographySection } from "./_components/TypographySection";
import { ThemePreview } from "./_components/ThemePreview";

export function ThemeSettingsClient() {
  const { theme, setTheme, customTheme, setCustomTheme, mounted } =
    useThemeContext();

  const resolved = resolveCustomTheme(customTheme);
  const { accentColor, radius, fontFamily, letterSpacing } = resolved;

  const handleAccentChange = (color: AccentColor) => {
    setCustomTheme({ ...customTheme, accentColor: color });
  };

  const handleRadiusChange = (r: RadiusSize) => {
    setCustomTheme({ ...customTheme, radius: r });
  };

  const handleFontChange = (f: FontFamily) => {
    setCustomTheme({ ...customTheme, fontFamily: f });
  };

  const handleLetterSpacingChange = (ls: LetterSpacing) => {
    setCustomTheme({ ...customTheme, letterSpacing: ls });
  };

  const handleApplyPreset = (preset: Required<CustomTheme>) => {
    setCustomTheme(preset);
  };

  if (!mounted) {
    return (
      <SettingsPage title="Theme">
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Theme">
      <SettingsSection
        title="Appearance"
        bodyClassName="max-w-2xl"
      >
        <ThemeModePicker value={theme} onChange={setTheme} />
      </SettingsSection>

      <SettingsSection
        title="Presets"
        bodyClassName="max-w-2xl"
      >
        <PresetsSection
          currentTheme={resolved}
          onApplyPreset={handleApplyPreset}
        />
      </SettingsSection>

      <SettingsSection
        title="Customize"
      >
        <div className="space-y-6">
          <AccentColorSection
            accentColor={accentColor}
            onAccentChange={handleAccentChange}
          />
          <TypographySection
            fontFamily={fontFamily}
            onFontChange={handleFontChange}
            letterSpacing={letterSpacing}
            onLetterSpacingChange={handleLetterSpacingChange}
            radius={radius}
            onRadiusChange={handleRadiusChange}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Preview"
      >
        <ThemePreview
          accentColor={accentColor}
          radius={radius}
          fontFamily={fontFamily}
          letterSpacing={letterSpacing}
          currentMode={theme}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
