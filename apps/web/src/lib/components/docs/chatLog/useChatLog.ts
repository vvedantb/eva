import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import type { ChatSourceArg } from "@/lib/components/sandbox/chatSource";

export type ChatLogEntry = FunctionReturnType<
  typeof api.chatLog.listForSource
>[number];

/** This chat's Log, oldest first (undefined while loading). */
export function useChatLog(source: ChatSourceArg) {
  return useQuery(api.chatLog.listForSource, { source });
}
