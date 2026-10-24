"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { LogoMark } from "@/lib/components/LogoMark";
import { useThemeContext } from "@/lib/contexts/useThemeContext";
import { resolveCustomTheme } from "@/lib/contexts/themeTokens";
import type {
  AccentColor,
  FontFamily,
  LetterSpacing,
  RadiusSize,
} from "@/lib/contexts/ThemeContext";
import { type ThemeMode } from "@/lib/hooks/useThemeMode";
import type { RolePresetKey } from "@/lib/components/personalisation/RolePresetPicker";
import { WelcomeSetupStepIndicator } from "./_components/WelcomeSetupStepIndicator";
import { WelcomeSetupIntroStep } from "./_components/WelcomeSetupIntroStep";
import { WelcomeSetupRoleStep } from "./_components/WelcomeSetupRoleStep";
import { WelcomeSetupThemeStep } from "./_components/WelcomeSetupThemeStep";
import { WelcomeSetupTypographyStep } from "./_components/WelcomeSetupTypographyStep";
import { WelcomeSetupNotificationsStep } from "./_components/WelcomeSetupNotificationsStep";
import {
  useDevPreviewSearchKey,
  useDevWelcomeSetupPreview,
} from "@/lib/dev/preview";
import { catchMutationError } from "@/lib/utils/mutationToast";

const TOTAL_STEPS = 5;

function stepDescription(step: number): string {
  if (step === 1) return "Here’s how the platform works.";
  if (step === 2) return "Tell us how you’d like Eva to communicate.";
  if (step === 3) return "Choose light or dark mode and an accent color.";
  if (step === 4) return "Fine-tune fonts, spacing, and corner radius.";
  return "Optional emails to stay up to date.";
}

export function WelcomeSetupDialog() {
  const navigate = useNavigate();
  const [dismissedPreviewKey, setDismissedPreviewKey] = useState<string | null>(
    null,
  );
  const [step, setStep] = useState(1);
  const onboarding = useQuery(api.auth.getOnboardingStatus);
  const personalisation = useQuery(api.auth.getPersonalisation);
  const completeOnboarding = useMutation(
    api.auth.completeOnboarding,
  ).withOptimisticUpdate((localStore) => {
    localStore.setQuery(api.auth.getOnboardingStatus, {}, { show: false });
  });
  const setRole = useMutation(api.auth.setRole).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.auth.getPersonalisation, {});
      if (current) {
        localStore.setQuery(
          api.auth.getPersonalisation,
          {},
          { ...current, role: args.role },
        );
      }
    },
  );

  const { theme, setTheme, customTheme, setCustomTheme, mounted } =
    useThemeContext();

  const previewSearchKey = useDevPreviewSearchKey();
  const isPreview = useDevWelcomeSetupPreview();
  const [stepResetKey, setStepResetKey] = useState(previewSearchKey);
  // Reset wizard when preview search key changes (no setState-in-effect).
  if (isPreview && previewSearchKey !== stepResetKey) {
    setStepResetKey(previewSearchKey);
    setStep(1);
  }
  const forceShow = isPreview && dismissedPreviewKey !== previewSearchKey;
  const shouldShow = forceShow || onboarding?.show;

  if (!shouldShow || !personalisation || !mounted) {
    return null;
  }

  const resolved = resolveCustomTheme(customTheme);
  const isLastStep = step === TOTAL_STEPS;

  const handleModeChange = (mode: ThemeMode) => {
    setTheme(mode);
  };

  const handleAccentChange = (color: AccentColor) => {
    setCustomTheme({ ...customTheme, accentColor: color });
  };

  const handleFontChange = (fontFamily: FontFamily) => {
    setCustomTheme({ ...customTheme, fontFamily });
  };

  const handleLetterSpacingChange = (letterSpacing: LetterSpacing) => {
    setCustomTheme({ ...customTheme, letterSpacing });
  };

  const handleRadiusChange = (radius: RadiusSize) => {
    setCustomTheme({ ...customTheme, radius });
  };

  const handleRoleSelect = (role: RolePresetKey | null) => {
    void setRole({ role });
  };

  const handleFinish = () => {
    if (isPreview) {
      setDismissedPreviewKey(previewSearchKey);
      return;
    }
    void catchMutationError(
      completeOnboarding({}),
      "Couldn't complete onboarding",
      "onboarding-complete",
    );
  };

  const handleNext = () => {
    if (isLastStep) {
      handleFinish();
      return;
    }
    setStep((current) => current + 1);
  };

  const handleBack = () => {
    setStep((current) => Math.max(1, current - 1));
  };

  const handleOpenThemeSettings = () => {
    handleFinish();
    navigate({ to: "/settings/theme" });
  };

  const handleOpenNotificationSettings = () => {
    handleFinish();
    navigate({ to: "/settings/notifications" });
  };

  return (
    <Dialog open>
      <DialogContent
        hideCloseButton
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        // `dvh`, not `vh`: mobile browser chrome makes `100vh` taller than the
        // visible area, which would push the footer buttons off screen.
        className="flex h-[min(90dvh,42rem)] max-w-[calc(100vw-2rem)] flex-col sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
              <LogoMark size={22} />
            </div>
            <div>
              <DialogTitle>Welcome to Eva!</DialogTitle>
              <DialogDescription className="min-h-10">
                {stepDescription(step)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col">
          <div className="mb-6 flex shrink-0 justify-center">
            <WelcomeSetupStepIndicator currentStep={step} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {step === 1 ? <WelcomeSetupIntroStep /> : null}
            {step === 2 ? (
              <WelcomeSetupRoleStep
                activeRole={personalisation.role}
                onSelect={handleRoleSelect}
              />
            ) : null}
            {step === 3 ? (
              <WelcomeSetupThemeStep
                currentMode={theme}
                accentColor={resolved.accentColor}
                onModeChange={handleModeChange}
                onAccentChange={handleAccentChange}
              />
            ) : null}
            {step === 4 ? (
              <WelcomeSetupTypographyStep
                fontFamily={resolved.fontFamily}
                letterSpacing={resolved.letterSpacing}
                radius={resolved.radius}
                onFontChange={handleFontChange}
                onLetterSpacingChange={handleLetterSpacingChange}
                onRadiusChange={handleRadiusChange}
                onOpenThemeSettings={handleOpenThemeSettings}
              />
            ) : null}
            {step === 5 ? (
              <WelcomeSetupNotificationsStep
                onOpenNotificationSettings={handleOpenNotificationSettings}
              />
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter className="shrink-0 gap-2 sm:justify-between">
          <div className="flex gap-2">
            {step === 1 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button variant="ghost" disabled>
                      Skip for now
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Nice try</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          <Button onClick={handleNext}>
            {isLastStep ? "Get started" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
