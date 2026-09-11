import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { Button, Checkbox, Spinner, toast } from "@eva/ui";
import { IconGitBranch, IconRefresh } from "@tabler/icons-react";
import { catchMutationError } from "@/lib/utils/mutationToast";

type RepoEntry = {
  owner: string;
  name: string;
};

function dedupeRepos(
  dbRepos: Array<{ owner: string; name: string }>,
  githubRepos: Array<{ owner: string; name: string }> | undefined,
): Array<RepoEntry> {
  const seen = new Set<string>();
  const result: Array<RepoEntry> = [];

  const all = githubRepos ? [...dbRepos, ...githubRepos] : dbRepos;

  for (const repo of all) {
    const key = `${repo.owner}/${repo.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ owner: repo.owner, name: repo.name });
  }

  return result;
}

export const Route = createFileRoute("/_global/settings/sync")({
  staticData: { title: "Settings" },
  component: SyncSettingsRoute,
});

function SyncSettingsRoute() {
  const syncSettings = useQuery(api.syncSettings.list);
  const dbRepos = useQuery(api.githubRepos.list, { includeHidden: true });
  const setSyncSetting = useMutation(api.syncSettings.set).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.syncSettings.list, {});
      if (current !== undefined) {
        const idx = current.findIndex(
          (s) => s.owner === args.owner && s.name === args.name,
        );
        if (idx >= 0) {
          localStore.setQuery(
            api.syncSettings.list,
            {},
            current.map((s, i) =>
              i === idx ? { ...s, enabled: args.enabled } : s,
            ),
          );
        }
      }
    },
  );
  const bulkSetSyncSettings = useMutation(
    api.syncSettings.bulkSet,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.syncSettings.list, {});
    if (current !== undefined) {
      const updates = new Map(
        args.repos.map((r) => [`${args.owner}/${r.name}`, r.enabled]),
      );
      localStore.setQuery(
        api.syncSettings.list,
        {},
        current.map((s) => {
          const key = `${s.owner}/${s.name}`;
          const newEnabled = updates.get(key);
          return newEnabled !== undefined ? { ...s, enabled: newEnabled } : s;
        }),
      );
    }
  });
  const listAvailableRepos = useAction(api.github.listAllAvailableRepos);

  const [fetching, setFetching] = useState(false);
  const [githubRepos, setGithubRepos] = useState<
    Array<{ owner: string; name: string }> | undefined
  >(undefined);

  const handleRefreshFromGithub = async () => {
    setFetching(true);
    try {
      const repos = await listAvailableRepos();
      setGithubRepos(repos);
    } catch (err) {
      console.error("Failed to fetch repos:", err);
      toast.error("Could not load repositories from GitHub. Try again.");
    }
    setFetching(false);
  };

  const repos = dbRepos ? dedupeRepos(dbRepos, githubRepos) : [];

  const disabledSet = new Set(
    (syncSettings ?? []).flatMap((s) =>
      s.enabled ? [] : [`${s.owner}/${s.name}`],
    ),
  );

  const isRepoEnabled = (owner: string, name: string) =>
    !disabledSet.has(`${owner}/${name}`);

  const handleToggleRepo = (owner: string, name: string, enabled: boolean) => {
    void catchMutationError(
      setSyncSetting({ owner, name, enabled }),
      "Couldn't update sync setting",
      "sync-repo-toggle",
    );
  };

  const groupedRepos = repos.reduce<Record<string, Array<RepoEntry>>>(
    (groups, repo) => {
      if (!groups[repo.owner]) {
        groups[repo.owner] = [];
      }
      groups[repo.owner].push(repo);
      return groups;
    },
    {},
  );

  const owners = Object.keys(groupedRepos).sort();

  const isOwnerAllEnabled = (owner: string) =>
    groupedRepos[owner].every((r) => isRepoEnabled(r.owner, r.name));

  const isOwnerSomeEnabled = (owner: string) =>
    groupedRepos[owner].some((r) => isRepoEnabled(r.owner, r.name));

  const handleToggleOwner = (owner: string) => {
    const allEnabled = isOwnerAllEnabled(owner);
    const newEnabled = !allEnabled;
    void catchMutationError(
      bulkSetSyncSettings({
        owner,
        repos: groupedRepos[owner].map((r) => ({
          name: r.name,
          enabled: newEnabled,
        })),
      }),
      "Couldn't update sync settings",
      "sync-owner-toggle",
    );
  };

  return (
    <SettingsPage
      title="Sync Settings"
      headerRight={
        <Button
          size="sm"
          variant="outline"
          disabled={fetching}
          onClick={handleRefreshFromGithub}
          className="motion-press border-border text-muted-foreground hover:scale-[1.01] active:scale-[0.96]"
        >
          <IconRefresh size={16} className={fetching ? "animate-spin" : ""} />
          <span className="max-sm:sr-only">Refresh</span>
        </Button>
      }
    >
      {syncSettings === undefined || dbRepos === undefined ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="md" />
        </div>
      ) : repos.length === 0 ? (
        <SettingsSection title="Repositories" bodyVariant="list">
          <SettingsEmptyState
            icon={IconGitBranch}
            title="No repos found"
            description="Sync your repos first, or fetch from GitHub to discover new ones."
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={fetching}
                onClick={handleRefreshFromGithub}
              >
                <IconRefresh
                  size={16}
                  className={fetching ? "animate-spin" : ""}
                />
                Fetch from GitHub
              </Button>
            }
          />
        </SettingsSection>
      ) : (
        <>
          <SettingsSection
            title="Repositories"
            description="Disabled repos are skipped during sync. New repos default to enabled."
          />
          {owners.map((owner) => (
            <OwnerGroup
              key={owner}
              owner={owner}
              repos={groupedRepos[owner]}
              allEnabled={isOwnerAllEnabled(owner)}
              someEnabled={isOwnerSomeEnabled(owner)}
              isRepoEnabled={isRepoEnabled}
              onToggleOwner={() => handleToggleOwner(owner)}
              onToggleRepo={handleToggleRepo}
            />
          ))}
        </>
      )}
    </SettingsPage>
  );
}

function OwnerGroup({
  owner,
  repos,
  allEnabled,
  someEnabled,
  isRepoEnabled,
  onToggleOwner,
  onToggleRepo,
}: {
  owner: string;
  repos: Array<RepoEntry>;
  allEnabled: boolean;
  someEnabled: boolean;
  isRepoEnabled: (owner: string, name: string) => boolean;
  onToggleOwner: () => void;
  onToggleRepo: (owner: string, name: string, enabled: boolean) => void;
}) {
  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));

  const enabledCount = repos.filter((r) =>
    isRepoEnabled(r.owner, r.name),
  ).length;

  return (
    // The owner is the section header, so its select-all checkbox sits in the
    // header and the repos read as the section body.
    <SettingsSection
      title={
        <label className="flex max-sm:min-w-0 cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={allEnabled ? true : someEnabled ? "indeterminate" : false}
            onCheckedChange={onToggleOwner}
          />
          <span className="max-sm:min-w-0 max-sm:truncate">{owner}</span>
        </label>
      }
      action={
        <span className="text-xs text-muted-foreground">
          {enabledCount}/{repos.length} enabled
        </span>
      }
      // Rows carry their own padding so the hover fill spans the full width.
      bodyVariant="compact"
    >
      {sorted.map((repo) => {
        const enabled = isRepoEnabled(repo.owner, repo.name);
        return (
          <label
            key={repo.name}
            // `py-2.5` below `sm` lifts the row to a 40px tap target; desktop
            // keeps the tighter list rhythm.
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted/60 sm:py-1.5"
          >
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) =>
                onToggleRepo(repo.owner, repo.name, checked === true)
              }
            />
            <span className="max-sm:min-w-0 max-sm:truncate">{repo.name}</span>
          </label>
        );
      })}
    </SettingsSection>
  );
}
