"use client";

import type { ReactNode } from "react";
import { BackgroundAgentsChip } from "./BackgroundAgentsChip";
import { GoalBanner } from "./GoalBanner";
import { PendingReviewCommentChips } from "./PendingReviewCommentChips";
import type { SandboxChatSurface } from "./sandboxChatSurface";
import { UsageLimitRecoveryBanner } from "./UsageLimitRecoveryBanner";
import { useStopBackgroundAgent } from "./useStopBackgroundAgent";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { RoutedThreadsBanner } from "@/lib/components/routed/RoutedThreadsBanner";

/**
 * The banner stack every sandbox chat renders above its composer: the `/goal`
 * banner, the pending review-comment chips and the usage-limit recovery card, with slots for whatever else a
 * surface puts between or after them. Status chips are not here: they go to
 * `SandboxChatStatusChips`, which shares the skill suggestions' row.
 */
export function SandboxChatPreInput({
  surface,
  beforeBanner,
  afterBanner,
}: {
  surface: SandboxChatSurface;
  /** Surface-specific rows above the recovery card. */
  beforeBanner?: ReactNode;
  /** Surface-specific rows below the recovery card. */
  afterBanner?: ReactNode;
}) {
  return (
    <>
      {/* Not gated by simple view: the user set this goal and can clear it. */}
      <GoalBanner goal={surface.goal} sendCommand={surface.sendCommand} />
      {beforeBanner}
      {/* Renders nothing outside a PendingReviewCommentsProvider. */}
      <PendingReviewCommentChips />
      {/* Not gated by simple view: recovery is a user action, not internals. */}
      <UsageLimitRecoveryBanner surface={surface} />
      {afterBanner}
      <RoutedThreadsBanner entity={surface.entity} />
    </>
  );
}

/**
 * The status chips every sandbox chat puts on the composer's chip row (next
 * to the skill suggestions): the background agents chip plus surface chips.
 * Each chip opens its own list, so background work never pushes the composer
 * down.
 */
export function SandboxChatStatusChips({
  surface,
  children,
}: {
  surface: SandboxChatSurface;
  /** Surface-specific chips after the agents chip. */
  children?: ReactNode;
}) {
  const { requestStop, stopDialog } = useStopBackgroundAgent(surface.entity);
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
      {children}
      {/* Outside the chip's popover, which closes when the dialog opens. */}
      {stopDialog}
    </>
  );
}
