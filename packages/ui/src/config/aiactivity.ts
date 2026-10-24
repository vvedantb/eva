// eva's look for the @vvedantb/ui agent activity family: the activity
// timeline, its question card and the model picker. Each value is what the
// legacy @eva/ui component rendered, so the swap changes no DOM.
import type { UiConfig } from "@vvedantb/ui";
import { Markdown } from "../markdown/Markdown";

export const aiactivityConfig = {
  ActivityTasks: {
    name: "Eva",
    markdown: Markdown,
    thinkingIcon: { src: "/icon.svg", alt: "Eva" },
  },
  ActivityQuestionCard: {
    // eva's `accent` is the neutral hover fill, not a brand colour.
    classes: { selectedOption: "bg-accent" },
  },
  ModelPicker: {
    classes: {
      trigger:
        "motion-press flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:opacity-50",
    },
    badgeRing: { trigger: "rgb(var(--input))", panel: "rgb(var(--muted))" },
  },
} satisfies UiConfig;
