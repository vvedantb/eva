"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import {
  groupReactions,
  reactionTargetKey,
  toggleReaction,
  type ReactionGroup,
  type ReactionTargetType,
} from "@eva/shared/taskDetail";

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

const EMPTY_GROUPS: ReactionGroup[] = [];

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
    patchLoadedQuery(localStore, api.taskReactions.listByTask, { taskId }, (cur) =>
      toggleReaction(cur, { ...args, userId: currentUserId }),
    );
  });

  const groupsByTarget = groupReactions(reactions, users, currentUserId);

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
    context.groupsByTarget.get(reactionTargetKey(targetType, targetId)) ?? EMPTY_GROUPS;
  const toggle = (emoji: string) => context.toggle(targetType, targetId, emoji);
  return { groups, toggle };
}
