import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction } from "convex/react";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { api } from "@eva/backend";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { repoHref } from "@/lib/utils/repoUrl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Skeleton,
  toast,
} from "@eva/ui";
import {
  IconDots,
  IconEyeOff,
  IconPlus,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";
import { WelcomeBanner } from "./_components/WelcomeBanner";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import { EmptyOnboarding } from "./_components/EmptyOnboarding";
import { RepoGroup } from "./_components/RepoGroup";
import { HiddenReposSheet } from "./_components/HiddenReposSheet";

const WELCOME_STORAGE_KEY = "eva-welcome-dismissed";

const buildConnectUrl = (slug: string) =>
  `https://github.com/apps/${slug}/installations/new`;

export function ReposClient() {
  const navigate = useNavigate();
  const repos = useQuery(api.githubRepos.list, {});
  const teams = useQuery(api.teams.list) ?? [];
  const appSlug = useQuery(api.githubRepos.getAppSlug);
  const syncRepos = useAction(api.github.syncRepos);
  const [syncing, setSyncing] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const altHeld = useAltHeld();
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    // Sync read avoids banner mount/unmount flash after hydration (CLS).
    // Only the storage read is wrapped: React Compiler bails on the whole file
    // when a logical expression sits inside a try/catch.
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(WELCOME_STORAGE_KEY);
    } catch {
      return false;
    }
    if (raw === null) return false;
    // usehooks-ts previously JSON-serialized booleans as "true"/"false".
    return raw === "true" || raw === '"true"';
  });
  const handleDismissWelcome = () => {
    setWelcomeDismissed(true);
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    } catch {
      // Ignore quota / private mode failures.
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncRepos();
    } catch (err) {
      console.error("Sync failed:", err);
      toast.error("Could not sync your repositories. Try again.");
    }
    setSyncing(false);
  };

  const connectUrl = appSlug ? buildConnectUrl(appSlug) : undefined;
  const configureUrl = "https://github.com/settings/installations";

  const hasRepos = repos && repos.length > 0;
  const primaryHref = hasRepos ? configureUrl : connectUrl;
  const primaryLabel = hasRepos ? "Add Repos" : "Connect GitHub";

  const groupedRepos = repos
    ? repos.reduce<Record<string, typeof repos>>((groups, repo) => {
        const team = repo.teamId
          ? teams.find((t) => t._id === repo.teamId)
          : undefined;
        const groupKey = team ? (team.displayName ?? team.name) : "My Team";
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(repo);
        return groups;
      }, {})
    : {};

  const groupNames = Object.keys(groupedRepos).sort((a, b) => {
    if (a === "My Team") return -1;
    if (b === "My Team") return 1;
    return a.localeCompare(b);
  });

  return (
    <PageWrapper
      title="Codebases"
      insetHeader
      headerRight={
        <div className="flex min-w-44 items-center justify-end gap-2">
          {(repos === undefined || hasRepos) && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={repos === undefined}
                    aria-label="Codebase options"
                    className="motion-press border-border text-muted-foreground hover:scale-[1.01] active:scale-[0.96]"
                  >
                    <IconDots size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/settings/sync" })}
                  >
                    <IconSettings size={16} />
                    Sync Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setHiddenOpen(true)}>
                    <IconEyeOff size={16} />
                    Hidden Codebases
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={syncing}
                    title={skipConfirmTitle("Sync Repos")}
                    onClick={() =>
                      requestConfirm(
                        altHeld,
                        () => setSyncConfirmOpen(true),
                        () => {
                          void handleSync();
                        },
                      )
                    }
                  >
                    <IconRefresh
                      size={16}
                      className={syncing ? "animate-spin" : ""}
                    />
                    {syncing ? "Syncing..." : "Sync Repos"}
                    <ConfirmSkipHint />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <HiddenReposSheet
                open={hiddenOpen}
                onOpenChange={setHiddenOpen}
              />
              <Dialog open={syncConfirmOpen} onOpenChange={setSyncConfirmOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Sync Repos</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    This will re-sync all repositories from GitHub. Continue?
                  </p>
                  <DialogFooter>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSyncConfirmOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={syncing}
                      onClick={() => {
                        setSyncConfirmOpen(false);
                        handleSync();
                      }}
                    >
                      <IconRefresh
                        size={16}
                        className={syncing ? "animate-spin" : ""}
                      />
                      Sync
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
          {primaryHref ? (
            <Button
              size="sm"
              asChild
              className="motion-press bg-foreground font-medium text-background hover:scale-[1.01] active:scale-[0.96]"
            >
              <a
                href={primaryHref}
                target={hasRepos ? "_blank" : undefined}
                rel={hasRepos ? "noopener noreferrer" : undefined}
              >
                <IconPlus size={16} />
                <span className="max-sm:sr-only">{primaryLabel}</span>
              </a>
            </Button>
          ) : (
            <Button
              size="sm"
              disabled
              className="motion-press bg-foreground font-medium text-background"
            >
              <IconPlus size={16} />
              <span className="max-sm:sr-only">{primaryLabel}</span>
            </Button>
          )}
        </div>
      }
    >
      {repos === undefined || appSlug === undefined ? (
        <div
          className="min-h-112 space-y-6"
          aria-busy="true"
          aria-label="Loading repositories"
        >
          <Skeleton className="ml-4 h-8 w-40" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 border border-border" />
            ))}
          </div>
        </div>
      ) : repos.length === 0 ? (
        <EmptyOnboarding connectUrl={buildConnectUrl(appSlug)} />
      ) : (
        <>
          <AnimatePresence initial={false}>
            {!welcomeDismissed && (
              <WelcomeBanner onDismiss={handleDismissWelcome} />
            )}
          </AnimatePresence>
          <div className="space-y-6">
            {groupNames.map((groupName) => (
              <RepoGroup
                key={groupName}
                groupName={groupName}
                repos={groupedRepos[groupName]}
                onManageApps={(repo) =>
                  navigate({
                    to:
                      repoHref(repo.owner, repo.name, repo.rootDirectory) +
                      "/settings/monorepo",
                  })
                }
              />
            ))}
          </div>
        </>
      )}
    </PageWrapper>
  );
}
