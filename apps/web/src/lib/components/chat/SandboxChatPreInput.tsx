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
  beforeBanner?: ReactNode;
  afterBanner?: ReactNode;
}) {
  return (
    <>
      <GoalBanner goal={surface.goal} sendCommand={surface.sendCommand} />
      {beforeBanner}
      <PendingReviewCommentChips />
      <UsageLimitRecoveryBanner surface={surface} />
      {afterBanner}
      {surface.entity ? <RoutedThreadsBanner entity={surface.entity} /> : null}
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
  children?: ReactNode;
}) {
  const { requestStop, stopDialog } = useStopBackgroundAgent(surface.entity);
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
      {stopDialog}
    </>
  );
}
