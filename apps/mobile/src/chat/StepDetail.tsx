import { api } from "@eva/backend";
import { parseToolSteps, type ToolStep } from "@eva/shared/activityTrace";
import { CodeBlock, MONO_FONT } from "@vvedantb/native-ui/ai";
import { Badge } from "@vvedantb/native-ui/primitives";
import { palette, tokens, withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

const copy = async (text: string) => {
  await Clipboard.setStringAsync(text);
};

/**
 * A tool step's body, as the web `ActivityStepDetail`: exit code and
 * "Truncated" badges, the shell transcript (`$ command` then output), and
 * edits as red before / green after blocks. Steps the transcript trimmed load
 * the full log for this message on open (`messages.activityLogById`).
 */
export function StepDetail({ step, index, messageId }: { step: ToolStep; index: number; messageId: string }) {
  const full = useQuery(api.messages.activityLogById, step.hasHiddenDetail ? { messageId } : "skip");
  const detailed = step.hasHiddenDetail ? (full ? parseToolSteps(full)[index] : undefined) : step;
  if (!detailed) {
    return <Muted>Loading output...</Muted>;
  }
  return <StepBody step={detailed} />;
}

function Muted({ children }: { children: string }) {
  const scheme = useScheme();
  return (
    <Text className="font-instrument-sans text-xs" style={{ color: tokens.color.muted[scheme] }}>
      {children}
    </Text>
  );
}

function StepBody({ step }: { step: ToolStep }) {
  const scheme = useScheme();
  const command = step.command ?? (step.type === "bash" ? step.detail : undefined);
  const transcript = [command ? `$ ${command}` : null, step.output?.text ?? null].filter(Boolean).join("\n\n");
  const exitCode = step.output?.exitCode;
  return (
    <View className="gap-2">
      {exitCode !== undefined || step.output?.truncated ? (
        <View className="flex-row flex-wrap gap-1.5">
          {exitCode !== undefined ? (
            <Badge variant={exitCode === 0 ? "secondary" : "destructive"}>{`Exit code ${exitCode}`}</Badge>
          ) : null}
          {step.output?.truncated ? <Badge variant="outline">Truncated</Badge> : null}
        </View>
      ) : null}
      {transcript ? <CodeBlock code={transcript} language="shell" onCopy={copy} /> : null}
      {(step.edits ?? []).map((edit, editIndex) => (
        <View
          key={editIndex}
          className="overflow-hidden rounded-md border"
          style={{ borderColor: tokens.color.border[scheme] }}
        >
          <Text
            selectable
            className="p-2 text-xs"
            style={{ fontFamily: MONO_FONT, color: palette.danger[scheme], backgroundColor: withAlpha(palette.danger[scheme], 0.1) }}
          >
            {edit.oldText}
          </Text>
          <Text
            selectable
            className="p-2 text-xs"
            // Web `bg-emerald-500/10 text-emerald-700` (dark: `text-emerald-300`).
            style={{
              fontFamily: MONO_FONT,
              color: scheme === "dark" ? "#6ee7b7" : "#047857",
              backgroundColor: withAlpha("#10b981", 0.1),
            }}
          >
            {edit.newText}
          </Text>
        </View>
      ))}
    </View>
  );
}
