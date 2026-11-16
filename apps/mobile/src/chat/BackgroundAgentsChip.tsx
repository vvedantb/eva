import { api, type Id } from "@eva/backend";
import {
  BACKGROUND_AGENT_STOP_FAILED,
  backgroundAgentStatusLine,
  backgroundAgentStopCopy,
  backgroundAgentsLabel,
  backgroundAgentTitle,
  isVisibleBackgroundAgent,
} from "@eva/shared/backgroundAgents";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlayerStop, IconRobot } from "@tabler/icons-react-native";
import { PROMPT_INPUT_CHIP, PromptInputChip } from "@vvedantb/native-ui/ai";
import { Button, ConfirmDialog } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Text, View } from "react-native";
import { FOOTER_CHIP, FooterSheet, useFooterChipColor, useSimpleView } from "@/chat/ComposerFooter";
import { useScheme } from "@/ui/theme";

/**
 * The web `BackgroundAgentsChip` on the composer's bar: while the chat has
 * agents running in the background, a robot, "Agents" and their count. A tap opens a
 * sheet with one row per agent (its description and status) and Stop, behind
 * the web confirm (`sessionWorkflow.requestStopBackgroundAgent`); a closed
 * chat lists them without Stop. Hidden in simple view, as the web. Not here
 * from the web: View (the subagent's own thread).
 */
export function BackgroundAgentsChip({ chatId, readOnly }: { chatId: Id<"sessionChats"> | undefined; readOnly: boolean }) {
  const theme = EVA_THEME[useScheme()];
  const color = useFooterChipColor();
  const simpleView = useSimpleView();
  const chat = useQuery(api.sessionChats.get, chatId && !simpleView ? { chatId } : "skip");
  const requestStop = useMutation(api.sessionWorkflow.requestStopBackgroundAgent);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ toolUseId: string; title: string } | null>(null);
  const agents = (chat?.backgroundAgents ?? []).filter(isVisibleBackgroundAgent);

  // The confirm closes on either button; a failed stop toasts.
  const copy = backgroundAgentStopCopy(target?.title);
  const stopDialog = (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) setTarget(null);
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      variant="destructive"
      onConfirm={() => {
        if (chatId && target) requestStop({ chatId, toolUseId: target.toolUseId }).catch(() => toast.error(BACKGROUND_AGENT_STOP_FAILED));
      }}
    />
  );
  // The dialog outlives the chip: the agent may finish while it is open.
  if (!chatId || agents.length === 0) return stopDialog;

  return (
    <>
      <PromptInputChip
        icon={<IconRobot size={PROMPT_INPUT_CHIP.iconSize} color={color} />}
        // As the Stash chip: a label that gives way when squeezed, and a count that stays.
        label="Agents"
        count={agents.length}
        chevron={false}
        {...FOOTER_CHIP}
        color={color}
        accessibilityLabel={`Background: ${backgroundAgentsLabel(agents.length)}`}
        onPress={() => setOpen(true)}
      />
      {/* Shut when the last agent leaves, so it never shows an empty list. */}
      <FooterSheet open={open && agents.length > 0} onOpenChange={setOpen} title="Background agents">
        {agents.map((agent) => {
          const title = backgroundAgentTitle(agent);
          return (
            <View key={agent.toolUseId} className="min-h-14 flex-row items-center gap-3 px-2 py-2">
              <IconRobot size={18} color={theme.mutedForeground} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
                  {title}
                </Text>
                <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
                  {backgroundAgentStatusLine(agent)}
                </Text>
              </View>
              {readOnly ? null : (
                <Button
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  leftIcon={<IconPlayerStop size={14} color={theme.foreground} />}
                  onPress={() => {
                    // The confirm opens over the composer, not over this sheet.
                    setOpen(false);
                    setTarget({ toolUseId: agent.toolUseId, title });
                  }}
                >
                  Stop
                </Button>
              )}
            </View>
          );
        })}
      </FooterSheet>
      {stopDialog}
    </>
  );
}
