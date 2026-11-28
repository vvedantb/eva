import { AnimatePresence } from "motion/react";
import { IconFolders } from "@tabler/icons-react";
import { RepoCard } from "./RepoCard";
import type { Repo } from "./RepoCard";

export function RepoGroup({
  groupName,
  repos,
}: {
  groupName: string;
  repos: Repo[];
}) {
  const byRepo = repos.reduce<Record<string, Repo[]>>((acc, repo) => {
    const key = `${repo.owner}/${repo.name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(repo);
    return acc;
  }, {});

  const repoGroups = Object.entries(byRepo).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-2">
      <h2 className="px-4 text-balance text-sm font-semibold text-foreground">
        {groupName}
      </h2>
      <div className="space-y-4">
        {repoGroups.map(([repoKey, items]) => {
          const isMonorepo =
            items.length > 1 || items.some((r) => r.rootDirectory);
          return (
            <div key={repoKey} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-4">
                {isMonorepo && (
                  <IconFolders size={14} className="text-muted-foreground/60" />
                )}
                <h3 className="text-xs font-medium text-muted-foreground">
                  {repoKey}
                </h3>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {items.map((repo, index) => (
                    <RepoCard
                      key={repo._id}
                      repo={repo}
                      index={index}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
