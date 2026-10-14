import { useState } from "react";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { CachedSessionShell } from "./_components/CachedSessionShell";

/** Cap mounted session shells so Preview iframes / PTYs stay bounded. */
const MAX_CACHED_SESSIONS = 5;

/**
 * One cached shell's identity. Repo is captured at cache time because bare
 * numIds collide across apps and this layout survives `$owner/$repo` param
 * changes — a shell must keep resolving against the repo it was opened in.
 */
interface CachedSessionEntry {
  key: string;
  owner: string;
  repoParam: string;
  numId: string;
}

function entryFromParams(params: {
  owner?: string;
  repo?: string;
  numId?: string;
}): CachedSessionEntry | undefined {
  const { owner, repo, numId } = params;
  if (
    typeof owner !== "string" ||
    typeof repo !== "string" ||
    typeof numId !== "string" ||
    numId.length === 0
  ) {
    return undefined;
  }
  return { key: `${owner}/${repo}/${numId}`, owner, repoParam: repo, numId };
}

/**
 * Sessions section layout. Keeps the last few opened session shells mounted
 * (hidden) so switching sessions — including across apps — does not remount
 * Preview iframes. `/sessions` (no `$numId`) still renders the new-session
 * composer via Outlet.
 */
export const Route = createFileRoute("/_repo/$owner/$repo/sessions")({
  staticData: { title: "Sessions" },
  component: SessionsLayout,
});

function SessionsLayout() {
  const params = useParams({ strict: false });
  const activeEntry = entryFromParams(params);

  const [cached, setCached] = useState<ReadonlyArray<CachedSessionEntry>>(() =>
    activeEntry !== undefined ? [activeEntry] : [],
  );

  // Render-phase sync (not an effect): promote the active session to the
  // front of the cache before its shell renders.
  if (activeEntry !== undefined && cached[0]?.key !== activeEntry.key) {
    setCached(
      [activeEntry, ...cached.filter((e) => e.key !== activeEntry.key)].slice(
        0,
        MAX_CACHED_SESSIONS,
      ),
    );
  }

  return (
    <div className="h-full min-h-0">
      <div className={activeEntry === undefined ? "h-full min-h-0" : "hidden"}>
        <Outlet />
      </div>
      {cached.map((entry) => {
        const isActive = entry.key === activeEntry?.key;
        return (
          <div
            key={entry.key}
            // Flex column: the shell's per-entry RepoGate sizes itself with
            // `flex-1`, which is inert in a block parent (height collapses and
            // the composer falls below the fold).
            className={
              isActive ? "flex h-full min-h-0 flex-col" : "hidden"
            }
            // Keep inactive shells out of the a11y tree while mounted.
            aria-hidden={!isActive}
          >
            <CachedSessionShell
              numId={entry.numId}
              owner={entry.owner}
              repoParam={entry.repoParam}
              isActiveRoute={isActive}
            />
          </div>
        );
      })}
    </div>
  );
}
