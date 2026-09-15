import { useEffect, useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { api, GITHUB_AUTH_REQUIRED } from "@eva/backend";
import { Container } from "@/lib/components/ui/Container";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { Button, Spinner, toast } from "@eva/ui";
import { IconBrandGithub } from "@tabler/icons-react";
import { RepoSetupList } from "./_components/RepoSetupList";
import type { GitHubRepo } from "./_components/RepoSetupCard";
import type { MonorepoApp } from "./_components/MonorepoAppsPanel";
import { userFacingErrorMessage } from "@/lib/utils/convexErrorMessage";

interface RepoSetupClientProps {
  installationId: string;
  autoSync: boolean;
}

export function RepoSetupClient({
  installationId,
  autoSync,
}: RepoSetupClientProps) {
  const navigate = useNavigate();

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsGitHubAuth, setNeedsGitHubAuth] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [addedRepos, setAddedRepos] = useState<Set<string>>(new Set());
  const [addingRepos, setAddingRepos] = useState<Set<string>>(new Set());
  // Key → why its last connect failed, so a partial failure is recoverable in
  // place instead of costing the user the whole page.
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [monorepoApps, setMonorepoApps] = useState<
    Record<string, MonorepoApp[]>
  >({});
  const [detectingMonorepo, setDetectingMonorepo] = useState<string | null>(
    null,
  );
  const syncedRef = useRef(false);

  const connectRepo = useAction(api.github.connectRepo);
  const fetchRepos = useAction(api.github.listRepos);
  const detectMonorepo = useAction(api.github.detectMonorepoApps);
  const startGitHubAuthorization = useMutation(
    api.githubUserAuth.startUserAuthorization,
  );

  useEffect(() => {
    fetchRepos({ installationId: Number(installationId) })
      .then((data) => {
        setRepos(data);
        setLoading(false);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "";
        // A brand-new installation is only verifiable through the user's own
        // GitHub token, so send them through the authorize hop instead of
        // showing a dead end.
        if (message.includes(GITHUB_AUTH_REQUIRED)) {
          setNeedsGitHubAuth(true);
        } else {
          setError(
            userFacingErrorMessage(
              err instanceof Error ? err : null,
              "Couldn't read this installation's repositories.",
            ),
          );
        }
        setLoading(false);
      });
  }, [installationId, fetchRepos]);

  const handleAuthorizeGitHub = async () => {
    if (authorizing) return;
    setAuthorizing(true);
    try {
      const url = await startGitHubAuthorization({
        installationId: Number(installationId),
      });
      window.location.href = url;
    } catch (err) {
      setError(
        userFacingErrorMessage(
          err instanceof Error ? err : null,
          "Couldn't start GitHub authorization.",
        ),
      );
      setAuthorizing(false);
    }
  };

  /** Connects one repo (or one app inside it). Resolves to whether it landed. */
  const addRepoEntry = async (repo: GitHubRepo, rootDirectory?: string) => {
    const key = rootDirectory
      ? `${repo.fullName}:${rootDirectory}`
      : repo.fullName;
    if (addedRepos.has(key)) return true;

    setAddingRepos((prev) => new Set(prev).add(key));
    setFailures((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    let added = false;
    try {
      await connectRepo({
        owner: repo.owner,
        name: repo.name,
        installationId: Number(installationId),
        githubId: repo.id,
        rootDirectory,
      });
      setAddedRepos((prev) => new Set([...prev, key]));
      added = true;
    } catch (err) {
      const reason = userFacingErrorMessage(
        err instanceof Error ? err : null,
        "Try again.",
      );
      setFailures((prev) => ({ ...prev, [key]: reason }));
      // An app inside a repo has no row of its own to hang the reason on.
      if (rootDirectory) toast.error(`Couldn't add ${key}. ${reason}`);
    }
    setAddingRepos((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    return added;
  };

  const handleAddAll = async () => {
    if (syncing) return;
    setSyncing(true);

    const pending = repos.filter((repo) => !addedRepos.has(repo.fullName));
    const results = await Promise.all(
      pending.map((repo) => addRepoEntry(repo)),
    );
    setSyncing(false);

    const failed = results.filter((added) => !added);
    // Navigating away here used to discard the failures with the page. The
    // per-repo Retry only exists if the user is still standing on it.
    if (failed.length > 0) {
      toast.error(
        `Could not add ${failed.length} of ${pending.length} repositories. Retry them below.`,
      );
      return;
    }
    navigate({ to: "/home" });
  };

  useEffect(() => {
    if (!loading && repos.length > 0 && autoSync && !syncedRef.current) {
      syncedRef.current = true;
      handleAddAll();
    }
  }, [loading, repos, autoSync]);

  const handleDetectMonorepo = async (repo: GitHubRepo) => {
    if (expandedRepo === repo.fullName) {
      setExpandedRepo(null);
      return;
    }

    setExpandedRepo(repo.fullName);

    if (monorepoApps[repo.fullName]) return;

    setDetectingMonorepo(repo.fullName);
    try {
      const apps = await detectMonorepo({
        installationId: Number(installationId),
        owner: repo.owner,
        name: repo.name,
      });
      setMonorepoApps((prev) => ({ ...prev, [repo.fullName]: apps }));
    } catch {
      setMonorepoApps((prev) => ({ ...prev, [repo.fullName]: [] }));
    }
    setDetectingMonorepo(null);
  };

  if (loading) {
    return (
      <Container>
        <div className="flex flex-col items-center justify-center py-20">
          <Spinner size="lg" className="mb-4" />
          <p className="text-muted-foreground">Loading codebases...</p>
        </div>
      </Container>
    );
  }

  if (needsGitHubAuth) {
    return (
      <Container>
        <div className="max-w-md mx-auto py-20 text-center">
          <h1 className="text-xl font-bold text-foreground mb-2">
            Connect your GitHub account
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Eva needs to confirm you can access this installation before adding
            its codebases.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={handleAuthorizeGitHub} disabled={authorizing}>
              {authorizing ? "Redirecting..." : "Continue with GitHub"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate({ to: "/home" })}
            >
              Cancel
            </Button>
          </div>
          {error && <p className="text-destructive text-sm mt-4">{error}</p>}
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="secondary" onClick={() => navigate({ to: "/home" })}>
            Back to Codebases
          </Button>
        </div>
      </Container>
    );
  }

  // Nothing to choose from: the install granted access to no repository, which
  // is fixed on GitHub rather than here.
  if (repos.length === 0) {
    return (
      <Container>
        <EmptyState
          icon={<IconBrandGithub size={24} />}
          title="This installation has no repositories Eva can see"
          description="Grant the Eva GitHub App access to repositories, then come back here."
          action={
            <Button asChild className="mt-6">
              <a
                href="https://github.com/settings/installations"
                target="_blank"
                rel="noopener noreferrer"
              >
                Manage GitHub access
              </a>
            </Button>
          }
        />
      </Container>
    );
  }

  return (
    <Container>
      <div className="max-w-2xl mx-auto py-4 sm:py-8">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-2 text-balance">
          GitHub App Installed
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">
          Select which codebases you want to add to Eva.
        </p>

        <RepoSetupList
          repos={repos}
          addedKeys={addedRepos}
          addingKeys={addingRepos}
          failures={failures}
          expandedRepo={expandedRepo}
          monorepoApps={monorepoApps}
          detectingMonorepo={detectingMonorepo}
          onToggleExpand={(repo) => void handleDetectMonorepo(repo)}
          onAdd={(repo) => void addRepoEntry(repo)}
          onAddApp={(repo, path) => void addRepoEntry(repo, path)}
        />

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            className="flex-1"
            onClick={handleAddAll}
            disabled={syncing || repos.length === addedRepos.size}
          >
            {syncing ? <Spinner size="sm" /> : null}
            {syncing ? "Adding codebases" : "Add All & Continue"}
          </Button>
          <Button variant="secondary" onClick={() => navigate({ to: "/home" })}>
            Done
          </Button>
        </div>
      </div>
    </Container>
  );
}
