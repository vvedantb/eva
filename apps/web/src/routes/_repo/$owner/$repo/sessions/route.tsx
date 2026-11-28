import { Activity, useState } from "react";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { CachedSessionShell } from "./_components/CachedSessionShell";

const MAX_CACHED_SESSIONS = 3;

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
          <Activity key={entry.key} mode={isActive ? "visible" : "hidden"}>
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
