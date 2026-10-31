"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import type { FunctionReturnType } from "convex/server";
import { getUserDisplayName } from "./task-detail-constants";

type ReactionView = FunctionReturnType<
  typeof api.taskReactions.listByTask
>[number];

// "comment" | "description" — sourced from the backend validator so the union
// stays in sync with the schema.
export type ReactionTargetType = ReactionView["targetType"];

interface Reactor {
  userId: Id<"users">;
  // Display name (the current user shown as "You").
  name: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  // Whether the current user is one of the reactors (drives chip highlight).
  reactedByMe: boolean;
  // Everyone who reacted with this emoji, for the chip's hover list.
  reactors: Reactor[];
}

interface TaskReactionsContextValue {
  groupsByTarget: Map<string, ReactionGroup[]>;
  toggle: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
  ) => Promise<void>;
}

const TaskReactionsContext = createContext<TaskReactionsContextValue | null>(
  null,
);

// Stable empty array so targets without reactions don't churn referential
// identity on every render.
const EMPTY_GROUPS: ReactionGroup[] = [];

// Composite key for the grouped map — a target is (type, id).
function targetKey(targetType: ReactionTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/**
 * Loads every reaction for a task once and distributes them via context, so any
 * reactable surface (comments, their nested replies, the task description) reads
 * its slice without prop drilling. The toggle mutation applies an optimistic
 * update keyed off the same query.
 */
export function TaskReactionsProvider({
  taskId,
  children,
}: {
  taskId: Id<"agentTasks">;
  children: ReactNode;
}) {
  const currentUserId = useQuery(api.auth.me);
  const reactions = useQuery(api.taskReactions.listByTask, { taskId });
  const users = useQuery(api.users.listAll);

  const toggleMutation = useMutation(
    api.taskReactions.toggle,
  ).withOptimisticUpdate((localStore, args) => {
    if (!currentUserId) return;
    patchLoadedQuery(localStore, api.taskReactions.listByTask, { taskId }, (cur) => {
      const existingIndex = cur.findIndex(
        (reaction) =>
          reaction.targetType === args.targetType &&
          reaction.targetId === args.targetId &&
          reaction.userId === currentUserId &&
          reaction.emoji === args.emoji,
      );
      return existingIndex >= 0
        ? cur.filter((_, index) => index !== existingIndex)
        : [
            ...cur,
            {
              targetType: args.targetType,
              targetId: args.targetId,
              userId: currentUserId,
              emoji: args.emoji,
            },
          ];
    });
  });

  const groupsByTarget = (() => {
    const map = new Map<string, ReactionGroup[]>();
    if (!reactions) return map;
    const nameById = new Map<Id<"users">, string>();
    for (const user of users ?? []) {
      nameById.set(user._id, getUserDisplayName(user));
    }
    // targetKey -> emoji -> reactor ids (in first-seen order, one row per user).
    const byTarget = new Map<string, Map<string, Id<"users">[]>>();
    for (const reaction of reactions) {
      const key = targetKey(reaction.targetType, reaction.targetId);
      let emojiMap = byTarget.get(key);
      if (!emojiMap) {
        emojiMap = new Map();
        byTarget.set(key, emojiMap);
      }
      const ids = emojiMap.get(reaction.emoji) ?? [];
      ids.push(reaction.userId);
      emojiMap.set(reaction.emoji, ids);
    }
    for (const [key, emojiMap] of byTarget) {
      map.set(
        key,
        [...emojiMap.entries()].map(([emoji, ids]) => ({
          emoji,
          count: ids.length,
          reactedByMe: currentUserId ? ids.includes(currentUserId) : false,
          reactors: ids.map((id) => ({
            userId: id,
            name:
              id === currentUserId ? "You" : (nameById.get(id) ?? "Someone"),
          })),
        })),
      );
    }
    return map;
  })();

  async function toggle(
    targetType: ReactionTargetType,
    targetId: string,
    emoji: string,
  ) {
    await toggleMutation({ taskId, targetType, targetId, emoji });
  }

  const value: TaskReactionsContextValue = { groupsByTarget, toggle };

  return (
    <TaskReactionsContext.Provider value={value}>
      {children}
    </TaskReactionsContext.Provider>
  );
}

/** Reaction groups + a bound toggle for a single reactable target. */
export function useReactions(targetType: ReactionTargetType, targetId: string) {
  const context = useContext(TaskReactionsContext);
  if (!context) {
    throw new Error("useReactions must be used within a TaskReactionsProvider");
  }
  const groups =
    context.groupsByTarget.get(targetKey(targetType, targetId)) ?? EMPTY_GROUPS;
  const toggle = (emoji: string) => context.toggle(targetType, targetId, emoji);
  return { groups, toggle };
}
