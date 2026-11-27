"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ConfettiBurst } from "@vvedantb/ui";
import { api, type PrOwnerRef } from "@eva/backend";
import { hasNewlyMergedPr } from "./prMergeCelebration";

/**
 * Plays one confetti burst from where it is placed when a PR of this chat
 * merges while the page is open. Merging is rare, so it gets the big moment;
 * a chat opened after the merge stays quiet.
 */
export function PrMergeConfetti({ owner }: { owner: PrOwnerRef }) {
  const prs = useQuery(api.pullRequests.listForOwner, { owner });
  const [seen, setSeen] = useState(prs);
  const [burst, setBurst] = useState(0);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);

  // Compare each new snapshot with the last one this view saw.
  if (prs !== seen) {
    if (seen !== undefined && prs !== undefined && hasNewlyMergedPr(seen, prs)) {
      setBurst((count) => count + 1);
    }
    setSeen(prs);
  }

  return (
    <span ref={setAnchor} aria-hidden className="contents">
      {burst > 0 && anchor?.parentElement ? (
        <ConfettiBurst
          key={burst}
          anchor={anchor.parentElement}
          onDone={() => setBurst(0)}
        />
      ) : null}
    </span>
  );
}
