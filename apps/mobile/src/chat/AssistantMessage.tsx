import { parseToolSteps, summariseToolSteps, type ToolStepType } from "@eva/shared/activityTrace";
import {
  IconBook2,
  IconFilePlus,
  IconFileSearch,
  IconFileText,
  IconFolderSearch,
  IconPencil,
  IconSearch,
  IconSitemap,
  IconTerminal2,
  IconTool,
  IconWorld,
  type IconProps,
} from "@tabler/icons-react-native";
import {
  ActivityStep,
  AgentTrace,
  AgentTraceCollapsible,
  AgentTraceCollapsibleContent,
  AgentTraceCollapsibleTrigger,
  AgentTraceIcon,
  AgentTraceLine,
  AgentTraceTitle,
  MONO_FONT,
} from "@vvedantb/native-ui/ai";
import { tokens } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import { useMarkdown } from "react-native-marked";
import { useScheme } from "@/ui/theme";

/** Same icon per step type as the web trace (`activity-shared.tsx` in @vvedantb/ui). */
const STEP_ICONS: Record<ToolStepType, ComponentType<IconProps>> = {
  read: IconFileSearch,
  edit: IconPencil,
  write: IconFilePlus,
  bash: IconTerminal2,
  search_files: IconFolderSearch,
  search_code: IconFileText,
  web_fetch: IconWorld,
  web_search: IconSearch,
  subtask: IconSitemap,
  notebook: IconBook2,
  tool: IconTool,
};

/**
 * A finished agent reply: its tool steps folded behind one summary line, as
 * the web does, then the reply rendered as markdown.
 */
export function AssistantMessage({ content, activityLog }: { content: string; activityLog?: string }) {
  const steps = parseToolSteps(activityLog);
  return (
    <>
      {steps.length > 0 ? (
        <AgentTraceCollapsible>
          <AgentTraceCollapsibleTrigger>
            <AgentTraceLine>
              <AgentTraceIcon icon={STEP_ICONS[steps[0]?.type ?? "tool"]} />
              <AgentTraceTitle>{summariseToolSteps(steps)}</AgentTraceTitle>
            </AgentTraceLine>
          </AgentTraceCollapsibleTrigger>
          <AgentTraceCollapsibleContent>
            <AgentTrace>
              {steps.map((step, index) => (
                <ActivityStep
                  key={index}
                  icon={STEP_ICONS[step.type]}
                  label={step.label}
                  description={step.detail}
                  status={step.status === "complete" ? "complete" : "running"}
                />
              ))}
            </AgentTrace>
          </AgentTraceCollapsibleContent>
        </AgentTraceCollapsible>
      ) : null}
      {content.trim() !== "" ? <MarkdownText value={content} /> : null}
    </>
  );
}

/** Markdown in the chat's colours and the native-ui code font. */
function MarkdownText({ value }: { value: string }) {
  const scheme = useScheme();
  const elements = useMarkdown(value, {
    colorScheme: scheme,
    theme: {
      colors: {
        text: tokens.color.foreground[scheme],
        link: tokens.color.foreground[scheme],
        code: tokens.color.surface[scheme],
        border: tokens.color.border[scheme],
      },
    },
    styles: {
      text: { fontFamily: "InstrumentSans_400Regular", fontSize: 16, lineHeight: 24 },
      strong: { fontFamily: "InstrumentSans_600SemiBold" },
      // Headings in the app font: the library default is the system font.
      h1: { fontFamily: "InstrumentSans_600SemiBold", fontSize: 22, lineHeight: 28 },
      h2: { fontFamily: "InstrumentSans_600SemiBold", fontSize: 20, lineHeight: 26 },
      h3: { fontFamily: "InstrumentSans_600SemiBold", fontSize: 18, lineHeight: 24 },
      codespan: { fontFamily: MONO_FONT, fontSize: 14, fontStyle: "normal" },
      codeText: { fontFamily: MONO_FONT, fontSize: 13 },
      link: { textDecorationLine: "underline" },
    },
  });
  return <>{elements}</>;
}
