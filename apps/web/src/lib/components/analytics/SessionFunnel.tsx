"use client";

import { Progress } from "@eva/ui";
import { Widget } from "@/lib/components/Widget";
import { useCountUpDisplay } from "@/lib/components/analytics/useCountUpDisplay";

interface SessionFunnelProps {
  totalSessions: number;
  sessionsWithPr: number;
}

export function SessionFunnel({
  totalSessions,
  sessionsWithPr,
}: SessionFunnelProps) {
  const sessionPrRate =
    totalSessions > 0 ? Math.round((sessionsWithPr / totalSessions) * 100) : 0;
  const totalSessionsDisplay = useCountUpDisplay(totalSessions);
  const sessionsWithPrDisplay = useCountUpDisplay(sessionsWithPr);
  const sessionPrRateDisplay = useCountUpDisplay(`${sessionPrRate}%`);
  return (
    <Widget
      title="Session to PR"
      subtitle="How many sessions produced a pull request."
    >
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Sessions Created</span>
            <span className="font-medium text-foreground">
              {totalSessionsDisplay}
            </span>
          </div>
          <Progress value={100} />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">PRs Opened</span>
            <span className="font-medium text-foreground">
              {sessionsWithPrDisplay}
            </span>
          </div>
          <Progress
            value={
              totalSessions > 0 ? (sessionsWithPr / totalSessions) * 100 : 0
            }
          />
        </div>
        <div className="pt-2">
          <p className="text-sm text-muted-foreground">
            Session PR rate:{" "}
            <span className="font-bold text-foreground">
              {sessionPrRateDisplay}
            </span>
          </p>
        </div>
      </div>
    </Widget>
  );
}
