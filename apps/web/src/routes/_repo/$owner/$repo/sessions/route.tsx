import { Activity, useState } from "react";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { CachedSessionShell } from "./_components/CachedSessionShell";

/**
 * Cap mounted session shells. Each hidden shell keeps its whole React tree,
 * DOM and held query results in the tab's memory; 3 covers back-and-forth
 * between recent sessions without paying for 5.
 */
const MAX_CACHED_SESSIONS = 3;

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
 * Sessions section layout. Keeps the last few opened session shells in a
 * hidden `<Activity>` so switching sessions — including across apps — does not
 * remount Preview iframes. `/sessions` (no `$numId`) still renders the new-session
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
        // Activity keeps a hidden shell's DOM and state (Preview iframes stay
        // loaded) but tears down its effects, so background sessions hold no
        // terminal sockets and stop redrawing while off screen.
        return (
          <Activity key={entry.key} mode={isActive ? "visible" : "hidden"}>
            {/* Flex column: the shell's per-entry RepoGate sizes itself with
                `flex-1`, which is inert in a block parent (height collapses
                and the composer falls below the fold). */}
            <div className="flex h-full min-h-0 flex-col">
              <CachedSessionShell
                numId={entry.numId}
                owner={entry.owner}
                repoParam={entry.repoParam}
                isActiveRoute={isActive}
              />
            </div>
          </Activity>
        );
      })}
    </div>
  );
}
