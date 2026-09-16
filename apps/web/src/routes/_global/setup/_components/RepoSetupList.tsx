"use client";

import { useState } from "react";
import { Button, Input } from "@eva/ui";
import { RepoSetupCard, type GitHubRepo } from "./RepoSetupCard";
import { MonorepoAppsPanel, type MonorepoApp } from "./MonorepoAppsPanel";

/** Below this the filter costs more attention than the scrolling it saves. */
const FILTER_THRESHOLD = 8;

interface RepoSetupListProps {
  repos: GitHubRepo[];
  /** Keys already connected — `owner/name`, or `owner/name:rootDirectory`. */
  addedKeys: Set<string>;
  /** Keys with a connect call in flight. */
  addingKeys: Set<string>;
  /** Key → the reason its last connect failed. */
  failures: Record<string, string>;
  expandedRepo: string | null;
  monorepoApps: Record<string, MonorepoApp[]>;
  detectingMonorepo: string | null;
  onToggleExpand: (repo: GitHubRepo) => void;
  onAdd: (repo: GitHubRepo) => void;
  onAddApp: (repo: GitHubRepo, rootDirectory: string) => void;
}

/**
 * The choosing half of setup: the repositories this installation exposes, each
 * with its own add / pending / failed state, so one repository failing does not
 * cost the user the other nine.
 */
export function RepoSetupList({
  repos,
  addedKeys,
  addingKeys,
  failures,
  expandedRepo,
  monorepoApps,
  detectingMonorepo,
  onToggleExpand,
  onAdd,
  onAddApp,
}: RepoSetupListProps) {
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const visible =
    needle.length === 0
      ? repos
      : repos.filter((repo) => repo.fullName.toLowerCase().includes(needle));

  return (
    <div className="mb-4 space-y-2 sm:mb-6 sm:space-y-3">
      {repos.length > FILTER_THRESHOLD ? (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter repositories…"
          aria-label="Filter repositories"
        />
      ) : null}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No repository matches “{filter.trim()}”.
        </p>
      ) : null}

      {visible.map((repo) => (
        <div key={repo.id} className="space-y-2">
          <RepoSetupCard
            repo={repo}
            isExpanded={expandedRepo === repo.fullName}
            isAdded={addedKeys.has(repo.fullName)}
            isAdding={addingKeys.has(repo.fullName)}
            onToggleExpand={() => onToggleExpand(repo)}
            onAdd={() => onAdd(repo)}
          >
            <MonorepoAppsPanel
              apps={monorepoApps[repo.fullName] ?? []}
              isDetecting={detectingMonorepo === repo.fullName}
              addedRepos={addedKeys}
              repoFullName={repo.fullName}
              onAddApp={(path) => onAddApp(repo, path)}
            />
          </RepoSetupCard>

          {failures[repo.fullName] ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-surface bg-destructive/10 px-3 py-2">
              <p className="min-w-0 text-xs text-destructive">
                Couldn&apos;t add {repo.fullName} — {failures[repo.fullName]}
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={addingKeys.has(repo.fullName)}
                onClick={() => onAdd(repo)}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
