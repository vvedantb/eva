"use client";

import { AveChat } from "@/lib/components/ave/AveChat";

/**
 * The popover's lazy half: everything behind the eager chrome in `AvePanel`
 * (see `aveLauncherChunkContract.test.ts`).
 */
export function AvePanelBody() {
  return <AveChat />;
}
