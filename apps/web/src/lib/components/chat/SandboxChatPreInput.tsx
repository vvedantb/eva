"use client";

import type { ReactNode } from "react";
import { BackgroundAgentsChip } from "./BackgroundAgentsChip";
import { GoalBanner } from "./GoalBanner";
import type { SandboxChatSurface } from "./sandboxChatSurface";
import { UsageLimitRecoveryBanner } from "./UsageLimitRecoveryBanner";
import { useStopBackgroundAgent } from "./useStopBackgroundAgent";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { RoutedThreadsBanner } from "@/lib/components/routed/RoutedThreadsBanner";

/**
 * The stack every sandbox chat renders above its composer: a chip row (the
 * background agents chip plus surface chips), the `/goal` banner and the usage-limit recovery card, with slots for whatever else
 * a surface puts between or after them.
 */
export function SandboxChatPreInput({
  surface,
  chips,
  beforeBanner,
  afterBanner,
}: {
  surface: SandboxChatSurface;
  /** Surface-specific chips on the same row as the agents chip. */
  chips?: ReactNode;
  /** Surface-specific rows between the agents chip and the recovery card. */
  beforeBanner?: ReactNode;
  /** Surface-specific rows below the recovery card. */
  afterBanner?: ReactNode;
}) {
  const requestStop = useStopBackgroundAgent(surface.entity);
  // Simple view hides agent internals (reasoning, tool detail), and the
  // subagent chip is that family of machinery.
  const simpleView = useSimpleView();

  return (
    <>
      {/* One row of chips, not a stack of panels: each chip opens its own
          list, so background work never pushes the composer down. */}
      <div className="flex flex-wrap items-center gap-x-1.5">
        {simpleView ? null : (
          <BackgroundAgentsChip
            backgroundAgents={surface.backgroundAgents}
            isReadOnly={surface.isReadOnly}
            onRequestStop={requestStop}
          />
        )}
        {chips}
      </div>
      {/* Not gated by simple view: the user set this goal and can clear it. */}
      <GoalBanner goal={surface.goal} sendCommand={surface.sendCommand} />
      {beforeBanner}
      {/* Not gated by simple view: recovery is a user action, not internals. */}
      <UsageLimitRecoveryBanner surface={surface} />
      {afterBanner}
      <RoutedThreadsBanner entity={surface.entity} />
    </>
  );
}
