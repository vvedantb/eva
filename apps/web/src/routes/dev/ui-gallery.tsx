import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { z } from "zod";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { FeedbackSection } from "./_components/ui-gallery/FeedbackSection";
import { ControlsSection } from "./_components/ui-gallery/ControlsSection";
import {
  CommandSection,
  DialogSection,
} from "./_components/ui-gallery/DialogSections";
import {
  HoverCardSection,
  PopoverSection,
  TooltipSection,
} from "./_components/ui-gallery/FloatingSections";
import {
  ContextMenuSection,
  DropdownMenuSection,
  SelectSection,
} from "./_components/ui-gallery/MenuSections";
import { AiChatSection } from "./_components/ui-gallery/AiChatSection";
import { AiActivitySection } from "./_components/ui-gallery/AiActivitySection";
import { KiboSection } from "./_components/ui-gallery/KiboSection";
import { MarkdownSection } from "./_components/ui-gallery/MarkdownSection";

/**
 * Static specimens of every eva UI component (`@vvedantb/ui` under eva's config), one section per page load, so
 * the UI migration can be proven pixel-identical with before/after captures
 * (`/tmp/eva-migration/capture.mjs`). Dev only.
 */
const SECTION_NAMES = [
  "feedback",
  "controls",
  "dialog",
  "popover",
  "hover-card",
  "tooltip",
  "dropdown-menu",
  "context-menu",
  "select",
  "command",
  "ai-chat",
  "ai-activity",
  "kibo",
  "markdown",
] as const;

const SECTIONS: Record<(typeof SECTION_NAMES)[number], () => ReactNode> = {
  feedback: FeedbackSection,
  controls: ControlsSection,
  dialog: DialogSection,
  popover: PopoverSection,
  "hover-card": HoverCardSection,
  tooltip: TooltipSection,
  "dropdown-menu": DropdownMenuSection,
  "context-menu": ContextMenuSection,
  select: SelectSection,
  command: CommandSection,
  "ai-chat": AiChatSection,
  "ai-activity": AiActivitySection,
  kibo: KiboSection,
  markdown: MarkdownSection,
};

const searchSchema = z.object({
  section: z.enum(SECTION_NAMES).catch("feedback"),
  theme: z.enum(["light", "dark"]).catch("light"),
});

export const Route = createFileRoute("/dev/ui-gallery")({
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: UiGalleryPage,
});

/**
 * Applies `?theme=` through the app's own ThemeModeProvider (the `.dark` class
 * on <html>), without persisting it to Convex. The effect re-runs when the
 * Convex theme sync overrides it on load, so the URL always wins.
 */
function useGalleryTheme(theme: "light" | "dark") {
  const { theme: current, setTheme } = useThemeMode();
  useEffect(() => {
    setTheme(theme);
  }, [current, theme, setTheme]);
}

function UiGalleryPage() {
  const { section, theme } = Route.useSearch();
  useGalleryTheme(theme);
  const Section = SECTIONS[section];
  return (
    <div
      className="min-h-dvh bg-background p-8 text-foreground"
      data-ui-gallery={section}
    >
      <h1 className="mb-6 font-mono text-xs text-muted-foreground">
        ui-gallery / {section} / {theme}
      </h1>
      <div className="flex flex-col gap-10">
        <Section />
      </div>
    </div>
  );
}
