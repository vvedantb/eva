"use client";

import { Badge, Button, CircleSpinner, motionFast } from "@eva/ui";
import type { AgentGoal } from "@eva/backend";
import { IconTargetArrow, IconX } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

/** Claude's own command; the daemon clears the banner when Claude confirms. */
const CLEAR_GOAL_COMMAND = "/goal clear";

function goalDetail(goal: AgentGoal): string {
  if (goal.status === "complete") return "Claude judged this goal met.";
  if (goal.checks === 0) return "Claude keeps working until this is met.";
  const times = goal.checks === 1 ? "1 time" : `${goal.checks} times`;
  return goal.lastCheck
    ? `Not met after ${times}: ${goal.lastCheck}`
    : `Not met after ${times}.`;
}

/**
 * Claude's native `/goal` for this chat, above the composer: the objective,
 * whether it is still being worked on, and Clear (sends `/goal clear`).
 */
export function GoalBanner({
  goal,
  sendCommand,
}: {
  goal: AgentGoal | undefined;
  sendCommand: ((command: string) => Promise<void>) | undefined;
}) {
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = (send: (command: string) => Promise<void>) => {
    setIsClearing(true);
    // The send path already toasts its own failure. Cleanup is duplicated
    // across `then`/`catch`: React Compiler cannot compile a `finally`.
    void send(CLEAR_GOAL_COMMAND)
      .then(() => setIsClearing(false))
      .catch(() => setIsClearing(false));
  };

  return (
    <AnimatePresence initial={false}>
      {goal === undefined ? null : (
        <m.div
          key="goal"
          className="mb-2 flex items-start gap-2.5 rounded-surface bg-muted p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={motionFast}
        >
          <IconTargetArrow
            size={18}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Goal
              </span>
              <Badge
                variant={goal.status === "complete" ? "success" : "secondary"}
                className="h-5 shrink-0 px-1.5 text-[10px] font-medium"
              >
                {goal.status === "complete" ? "Met" : "Active"}
              </Badge>
            </div>
            <p className="line-clamp-2 text-sm font-medium" title={goal.objective}>
              {goal.objective}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {goalDetail(goal)}
            </p>
          </div>
          {sendCommand ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={isClearing}
              onClick={() => handleClear(sendCommand)}
            >
              {isClearing ? (
                <CircleSpinner size="sm" className="size-3.5" />
              ) : (
                <IconX className="size-3.5" />
              )}
              Clear
            </Button>
          ) : null}
        </m.div>
      )}
    </AnimatePresence>
  );
}
