"use client";

import { IconStar, IconUser } from "@tabler/icons-react";
import { m } from "motion/react";
import { motionBase, motionStagger } from "@eva/ui";
import { Widget } from "@/lib/components/Widget";
import type { FunctionReturnType } from "convex/server";
import { type api } from "@eva/backend";
import { ScoreBar } from "./ScoreBar";
import { StatusChip } from "./StatusChip";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";

type LeaderboardEntry = FunctionReturnType<
  typeof api.analytics.getLeaderboard
>[number];

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

// Combined PR + task activity drives the relative score bar — real data,
// not an invented score. Each bar is sized against the top contributor.
function activityOf(entry: LeaderboardEntry): number {
  return entry.prsCreated + entry.tasksCompleted;
}

export function Leaderboard({ entries }: LeaderboardProps) {
  const maxActivity = entries.length
    ? Math.max(1, ...entries.map(activityOf))
    : 1;

  return (
    <Widget
      title="Top contributors"
      subtitle="Who shipped the most PRs and tasks."
    >
      {entries.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No activity yet
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, index) => {
            const isTop = index === 0;
            return (
              <m.div
                key={entry.clerkId}
                className="space-y-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...motionBase, delay: motionStagger(index) }}
              >
                <div className="group flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <IconUser size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <MarqueeOnHover className="text-sm font-medium text-foreground">
                      <span data-pii>{entry.fullName || "Unknown User"}</span>
                    </MarqueeOnHover>
                    <p className="text-xs text-muted-foreground">
                      {entry.prsCreated} PRs · {entry.tasksCompleted} tasks
                    </p>
                  </div>
                  {isTop && (
                    <StatusChip tone="top" icon={IconStar}>
                      Top
                    </StatusChip>
                  )}
                </div>
                <ScoreBar
                  value={activityOf(entry)}
                  max={maxActivity}
                  tone={isTop ? "top" : "default"}
                />
              </m.div>
            );
          })}
        </div>
      )}
    </Widget>
  );
}
