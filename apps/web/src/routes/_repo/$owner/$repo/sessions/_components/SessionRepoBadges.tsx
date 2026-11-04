"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vvedantb/ui";
import { IconGitPullRequest } from "@tabler/icons-react";
import { RepoAppMark } from "@/lib/components/RepoLogo";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { prStateIconClass } from "@/lib/components/prStateIconClass";

interface SessionRepoBadgesProps {
  sessionId: Id<"sessions">;
}

/**
 * Compact per-repo badges for a multi-repo session's header — logo, label,
 * and a PR link when one exists. Renders nothing for an ordinary single-repo
 * session so the header stays pixel-identical there.
 */
export function SessionRepoBadges({ sessionId }: SessionRepoBadgesProps) {
  const repos = useQuery(api.sessions.listRepos, { sessionId });

  if (!repos || repos.length <= 1) return null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      {repos.map((repo) => {
        const label = repoDisplayLabel(repo);
        return (
          <span
            key={repo.repoId}
            title={`${repo.owner}/${repo.name}`}
            className="inline-flex min-w-0 max-w-28 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
          >
            <RepoAppMark repo={repo} />
            <span className="min-w-0 truncate">{label}</span>
            {repo.prUrl ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={repo.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconGitPullRequest
                      size={12}
                      className={prStateIconClass(repo.prState)}
                    />
                  </a>
                </TooltipTrigger>
                <TooltipContent>View PR</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
