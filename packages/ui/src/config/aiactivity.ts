import { Markdown, type UiConfig } from "@vvedantb/ui";

export const aiactivityConfig = {
  ActivityTasks: {
    name: "Eva",
    markdown: Markdown,
    thinkingIcon: { src: "/icon.svg", alt: "Eva" },
  },
  ActivityQuestionCard: {
    classes: { selectedOption: "bg-accent-soft" },
  },
  ModelPicker: {
    classes: {
      trigger:
        "motion-press flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent-soft hover:text-foreground active:scale-[0.98] disabled:opacity-50",
    },
    badgeRing: { trigger: "var(--border)", panel: "var(--surface-secondary)" },
  },
} satisfies UiConfig;
