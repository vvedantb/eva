import { api } from "@eva/backend";
import { parseActivityLog, type ActivityLogStep } from "@eva/shared/activityTrace";
import { ActivityStepDetail } from "@vvedantb/native-ui/ai";
import { useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";

const copy = async (text: string) => {
  await Clipboard.setStringAsync(text);
};

/**
 * A tool step's body (native-ui `ActivityStepDetail`, the web component).
 * Steps the transcript trimmed load this message's full log on open
 * (`messages.activityLogById`); until then it reads "Loading output...".
 */
export function StepDetail({ step, index, messageId }: { step: ActivityLogStep; index: number; messageId: string }) {
  const full = useQuery(api.messages.activityLogById, step.hasHiddenDetail ? { messageId } : "skip");
  const loaded = full ? parseActivityLog(full)[index] : undefined;
  return <ActivityStepDetail step={loaded ?? step} onCopy={copy} />;
}
