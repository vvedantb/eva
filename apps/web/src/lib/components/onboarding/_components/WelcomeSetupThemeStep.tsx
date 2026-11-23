import { ThemeModePicker } from "@vvedantb/ui";
import { AccentColorSection } from "@/lib/components/theme/_components/AccentColorSection";
import { SectionLabel } from "@/lib/components/theme/_components/SectionLabel";
import type { AccentColor } from "@/lib/contexts/ThemeContext";
import type { ThemeMode } from "@/lib/hooks/useThemeMode";

interface WelcomeSetupThemeStepProps {
  currentMode: ThemeMode;
  accentColor: AccentColor;
  onModeChange: (mode: ThemeMode) => void;
  onAccentChange: (color: AccentColor) => void;
}

export function WelcomeSetupThemeStep({
  currentMode,
  accentColor,
  onModeChange,
  onAccentChange,
}: WelcomeSetupThemeStepProps) {
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Choose how Eva looks — mode and accent color.
      </p>
      <section>
        <SectionLabel>Appearance</SectionLabel>
        <ThemeModePicker
          compact
          value={currentMode}
          onChange={onModeChange}
        />
      </section>
      <section>
        <SectionLabel>Accent Color</SectionLabel>
        <AccentColorSection
          accentColor={accentColor}
          onAccentChange={onAccentChange}
        />
      </section>
    </div>
  );
}
