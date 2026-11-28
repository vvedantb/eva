import { api, type Doc, type Id } from "@eva/backend";
import { formatDurationMs } from "@eva/shared/duration";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlayerStop, IconTerminal2 } from "@tabler/icons-react-native";
import { MONO_FONT, PROMPT_INPUT_CHIP, PromptInputChip } from "@vvedantb/native-ui/ai";
import { Button } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { FOOTER_CHIP, FooterSheet, useFooterChipColor, useSimpleView } from "@/chat/ComposerFooter";
import { useNow } from "@/ui/clock";
import { useScheme } from "@/ui/theme";

const RECONCILE_MS = 15_000;

/**
 * The web `BackgroundProcessesChip` on the composer's bar, after the agents
 * chip: while the session's sandbox runs shell processes the agent sent to the
 * background, a terminal, "Processes" and their count. A tap opens a sheet
 * with one row per process (its command and how long it has run) and Stop
 * (`sandbox.killBackgroundProcess`, no confirm, as the web). While it shows,
 * it reconciles the list with the sandbox every 15 s, as the web. Hidden in
 * simple view, as the web.
 */
export function BackgroundProcessesChip({ sessionId }: { sessionId: Id<"sessions"> | undefined }) {
  const color = useFooterChipColor();
  const simpleView = useSimpleView();
  const rows = useQuery(api.backgroundProcesses.listRunning, sessionId && !simpleView ? { sessionId } : "skip") ?? [];
  const reconcile = useAction(api.sandbox.reconcileBackgroundProcesses);
  const kill = useAction(api.sandbox.killBackgroundProcess);
  const [open, setOpen] = useState(false);
  const [killing, setKilling] = useState<ReadonlySet<string>>(() => new Set());
  const live = sessionId !== undefined && rows.length > 0;

  useEffect(() => {
    if (!live) return;
    const run = () => {
      if (AppState.currentState !== "active") return;
      reconcile({ sessionId }).catch(() => undefined);
    };
    run();
    const timer = setInterval(run, RECONCILE_MS);
    return () => clearInterval(timer);
  }, [live, reconcile, sessionId]);

  if (!live && open) setOpen(false);
  if (!live) return null;

  const stop = (id: Id<"backgroundProcesses">) => {
    setKilling((current) => new Set(current).add(id));
    kill({ id })
      .then(() => reconcile({ sessionId }).catch(() => undefined))
      .catch(() => toast.error("Couldn't stop background process"))
      .finally(() =>
        setKilling((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        }),
      );
  };

  return (
    <>
      <PromptInputChip
        icon={<IconTerminal2 size={PROMPT_INPUT_CHIP.iconSize} color={color} />}
        label={rows.length === 1 ? "Process" : "Processes"}
        count={rows.length}
        chevron={false}
        {...FOOTER_CHIP}
        color={color}
        accessibilityLabel={`${rows.length} background ${rows.length === 1 ? "process" : "processes"}`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet open={open} onOpenChange={setOpen} title="Background processes">
        {rows.map((row) => (
          <ProcessRow key={row._id} row={row} stopping={killing.has(row._id)} onStop={() => stop(row._id)} />
        ))}
      </FooterSheet>
    </>
  );
}

function ProcessRow({ row, stopping, onStop }: { row: Doc<"backgroundProcesses">; stopping: boolean; onStop: () => void }) {
  const theme = EVA_THEME[useScheme()];
  const now = useNow(1000);
  return (
    <View className="min-h-14 flex-row items-center gap-3 px-2 py-2">
      <IconTerminal2 size={18} color={theme.mutedForeground} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-xs" style={{ color: theme.foreground, fontFamily: MONO_FONT }}>
          {row.command}
        </Text>
        <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground, fontVariant: ["tabular-nums"] }}>
          {formatDurationMs(Math.max(0, now - row.startedAt))}
        </Text>
      </View>
      <Button
        size="sm"
        fullWidth={false}
        variant="outline"
        loading={stopping}
        leftIcon={<IconPlayerStop size={14} color={theme.foreground} />}
        onPress={onStop}
      >
        Stop
      </Button>
    </View>
  );
}
