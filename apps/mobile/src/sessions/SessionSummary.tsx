import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconSparkles, type IconProps } from "@tabler/icons-react-native";
import { Collapsible, CollapsibleChevron, CollapsibleContent, CollapsibleTrigger, useCollapsible } from "@vvedantb/native-ui/ai";
import { ConfirmDialog } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { LiveActivityStatus } from "@/chat/AssistantMessage";
import { useScheme } from "@/ui/theme";

/**
 * The web chat header's "Summarise Session" (or "Regenerate Summary" once
 * there is one): `menuItem` is its ⋯ menu entry, disabled until the sandbox
 * is awake and the chat has a message, as the web; it opens `dialog`, the web
 * `SessionSummaryModal` confirm, whose Confirm starts the summary
 * (`summarizeWorkflow.startSummarize`). Render `dialog` once.
 */
export function useSessionSummary({
  sessionId,
  hasSummary,
  canSummarise,
}: {
  sessionId: Id<"sessions"> | undefined;
  hasSummary: boolean;
  /** The web `canSummarise`: the sandbox is awake and the chat has messages. */
  canSummarise: boolean;
}) {
  const startSummarize = useMutation(api.summarizeWorkflow.startSummarize);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const title = hasSummary ? "Regenerate Summary" : "Generate Summary";

  const menuItem: { label: string; icon: ComponentType<IconProps>; disabled: boolean; onSelect: () => void } | null = sessionId
    ? {
        label: hasSummary ? "Regenerate Summary" : "Summarise Session",
        icon: IconSparkles,
        disabled: !canSummarise,
        onSelect: () => setConfirmOpen(true),
      }
    : null;

  const dialog = sessionId ? (
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title={title}
      description={
        hasSummary
          ? "This will regenerate and replace the current session summary."
          : "This will generate a session summary from the current chat history."
      }
      confirmLabel="Confirm"
      onConfirm={() => {
        startSummarize({ sessionId }).catch(() => toast.error("Couldn't generate summary", { id: "session-summarize" }));
      }}
    />
  ) : null;

  return { menuItem, dialog };
}

/**
 * The web `SessionSummaryAccordion` above the transcript: "Session summary"
 * folded, its bullets inside. While a summary is being written it shows the
 * live step (the summary's streaming row, `summary:<sessionId>`), and it
 * opens itself when it appears that way, as the web. Nothing shows until
 * there is a summary or one is being written.
 */
export function SessionSummaryBlock({ sessionId, summary }: { sessionId: Id<"sessions">; summary: string[] | undefined }) {
  const theme = EVA_THEME[useScheme()];
  const streaming = useQuery(api.streaming.get, { entityId: `summary:${sessionId}` });
  const activity = streaming?.currentActivity;
  const isStreaming = Boolean(activity);
  const items = summary ?? [];
  if (!isStreaming && items.length === 0) return null;
  return (
    // The web `rounded-b-lg border-x border-b bg-card`, hung under the header.
    <Collapsible defaultOpen={isStreaming} className="mx-3 rounded-b-lg border-x border-b px-3" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <SummaryTrigger />
      <CollapsibleContent className="pb-2">
        {isStreaming ? (
          <LiveActivityStatus activityLog={activity} />
        ) : (
          <View className="gap-1 pl-1">
            {items.map((item) => (
              <View key={item} className="flex-row gap-2">
                <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
                  •
                </Text>
                <Text className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: theme.mutedForeground }}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The web `AccordionTrigger`: the sparkles, "Session summary", and the chevron at the end. */
function SummaryTrigger() {
  const theme = EVA_THEME[useScheme()];
  const { open } = useCollapsible();
  return (
    <CollapsibleTrigger className="flex-row items-center gap-2 py-2">
      <IconSparkles size={14} color={theme.mutedForeground} />
      <Text className="font-instrument-sans min-w-0 flex-1 text-sm" style={{ color: theme.foreground }}>
        Session summary
      </Text>
      <CollapsibleChevron open={open} size={16} color={theme.mutedForeground} />
    </CollapsibleTrigger>
  );
}
