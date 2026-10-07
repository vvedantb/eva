"use client";

import type { ReactNode } from "react";
import { BackgroundAgentsChip } from "./BackgroundAgentsChip";
import type { SandboxChatSurface } from "./sandboxChatSurface";
import { UsageLimitRecoveryBanner } from "./UsageLimitRecoveryBanner";
import { useStopBackgroundAgent } from "./useStopBackgroundAgent";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

/**
 * The stack every sandbox chat renders above its composer: the background
 * agents chip and the usage-limit recovery card, with slots for whatever else
 * a surface puts between or after them.
 */
export function SandboxChatPreInput({
  surface,
  beforeBanner,
  afterBanner,
}: {
  surface: SandboxChatSurface;
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
      {simpleView ? null : (
        <BackgroundAgentsChip
          backgroundAgents={surface.backgroundAgents}
          isReadOnly={surface.isReadOnly}
          onRequestStop={requestStop}
        />
      )}
      {beforeBanner}
      {/* Not gated by simple view: recovery is a user action, not internals. */}
      <UsageLimitRecoveryBanner surface={surface} />
      {afterBanner}
    </>
  );
}
