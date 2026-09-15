"use client";

import type { ReactNode } from "react";
import { BackgroundAgentsChip } from "./BackgroundAgentsChip";
import {
  COMPACT_COMMAND,
  ComposerCompactionBanner,
  useCompactionBanner,
} from "./ComposerCompactionBanner";
import { chatEntityKeys, type SandboxChatSurface } from "./sandboxChatSurface";
import { UsageLimitRecoveryBanner } from "./UsageLimitRecoveryBanner";
import { useStopBackgroundAgent } from "./useStopBackgroundAgent";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

/**
 * The stack every sandbox chat renders above its composer: the background
 * agents chip, the usage-limit recovery card and the compaction offer, with
 * slots for whatever else a surface puts between or after them.
 */
export function SandboxChatPreInput({
  surface,
  beforeBanner,
  afterBanner,
}: {
  surface: SandboxChatSurface;
  /** Surface-specific rows between the agents chip and the compaction banner. */
  beforeBanner?: ReactNode;
  /** Surface-specific rows below the compaction banner. */
  afterBanner?: ReactNode;
}) {
  const { parentId } = chatEntityKeys(surface.entity);
  const requestStop = useStopBackgroundAgent(surface.entity);
  // Simple view hides agent internals (reasoning, tool detail) — the subagent
  // chip and the token-budget compaction offer are the same family of
  // machinery. The hooks below still run unconditionally; only the render is
  // gated.
  const simpleView = useSimpleView();
  const compaction = useCompactionBanner({
    repoId: surface.repoId,
    entityId: String(parentId),
    model: surface.model,
    isExecuting: surface.isExecuting,
    isReadOnly: surface.compactionReadOnly,
  });

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
      {compaction && !simpleView ? (
        <ComposerCompactionBanner
          usedTokens={compaction.usedTokens}
          onCompact={() => surface.onSendCommand(COMPACT_COMMAND)}
          onDismiss={compaction.onDismiss}
        />
      ) : null}
      {afterBanner}
    </>
  );
}
