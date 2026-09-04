"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { Button, Input, Spinner, Badge } from "@eva/ui";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import {
  IconFolders,
  IconPlus,
  IconCheck,
  IconTerminal2,
  IconAlertCircle,
  IconRefresh,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

type DetectedApp = FunctionReturnType<
  typeof api.github.detectMonorepoApps
>[number];

export function MonorepoClient() {
  const { repo } = useRepo();
  const detectApps = useAction(api.github.detectMonorepoApps);
  const createRepo = useMutation(api.githubRepos.create);
  const toggleHidden = useMutation(
    api.githubRepos.toggleHidden,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.githubRepos.list, {
      includeHidden: true,
    });
    if (current !== undefined) {
      localStore.setQuery(
        api.githubRepos.list,
        { includeHidden: true },
        current.map((r) =>
          r._id === args.repoId ? { ...r, hidden: args.hidden } : r,
        ),
      );
    }
  });
  const allRepos = useQuery(api.githubRepos.list, { includeHidden: true });

  const [detected, setDetected] = useState<ReadonlyArray<DetectedApp>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingPath, setAddingPath] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState("");

  const connectedApps = (allRepos ?? []).filter(
    (r) => r.owner === repo.owner && r.name === repo.name && r.rootDirectory,
  );

  const connectedPaths = new Set(connectedApps.map((r) => r.rootDirectory));

  const runDetection = async () => {
    setLoading(true);
    setError(null);
    try {
      const apps = await detectApps({
        installationId: repo.installationId,
        owner: repo.owner,
        name: repo.name,
      });
      setDetected(apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    }
    setLoading(false);
  };

  useEffect(() => {
    void runDetection();
    // eslint-disable-next-line react/exhaustive-deps
  }, [repo.owner, repo.name, repo.installationId]);

  const handleAdd = async (path: string) => {
    setAddingPath(path);
    try {
      await withMutationToast(
        createRepo({
          owner: repo.owner,
          name: repo.name,
          installationId: repo.installationId,
          githubId: repo.githubId,
          rootDirectory: path,
          teamId: repo.teamId,
        }),
        "App added",
        "Couldn't add app",
        "monorepo-add-app",
      );
    } catch {
      // Toast already shown.
    }
    setAddingPath(null);
  };

  const handleAddCustom = async () => {
    const trimmed = customPath.trim().replace(/^\/+|\/+$/g, "");
    if (!trimmed) return;
    await handleAdd(trimmed);
    setCustomPath("");
  };

  return (
    <SettingsPage
      title="Monorepo Apps"
      headerRight={
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void runDetection()}
          className="motion-press border-border text-muted-foreground"
        >
          <IconRefresh size={16} className={loading ? "animate-spin" : ""} />
          <span className="max-sm:sr-only">Re-detect</span>
        </Button>
      }
    >
      {connectedApps.length > 0 && (
        <SettingsSection
          title="Connected apps"
          description="Hide apps without removing them."
          // Rows own their padding so the row divider spans the full width.
          bodyVariant="list"
        >
          <div className="divide-y divide-border/50">
            {connectedApps.map((app) => (
              <div
                key={app._id}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <IconFolders
                  size={18}
                  className="shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {app.rootDirectory?.split("/").pop()}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {app.rootDirectory}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={app.hidden ? "outline" : "ghost"}
                  onClick={() =>
                    void catchMutationError(
                      toggleHidden({
                        repoId: app._id,
                        hidden: app.hidden !== true,
                      }),
                      "Couldn't update app visibility",
                      "monorepo-toggle-hidden",
                    )
                  }
                  className="motion-press gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  {app.hidden ? (
                    <>
                      <IconEyeOff size={14} />
                      Hidden
                    </>
                  ) : (
                    <>
                      <IconEye size={14} />
                      Visible
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title="Detected apps"
        description={
          <>
            Found in{" "}
            <span className="font-medium text-foreground">
              {repo.owner}/{repo.name}
            </span>
            . Add one as a separate codebase.
          </>
        }
        bodyVariant="list"
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Spinner size="md" />
            <p className="text-sm text-muted-foreground">
              Scanning workspace configuration...
            </p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <IconAlertCircle
              size={20}
              className="shrink-0 text-destructive"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Detection failed
              </p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : detected.length === 0 ? (
          <SettingsEmptyState
            icon={IconFolders}
            title="No workspace apps detected"
            description="This repository has no monorepo workspace configuration (package.json workspaces or pnpm-workspace.yaml)."
          />
        ) : (
          <div className="divide-y divide-border/50">
            {detected.map((app) => {
              const isConnected = connectedPaths.has(app.path);
              const isAdding = addingPath === app.path;

              return (
                <div
                  key={app.path}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <IconFolders
                    size={18}
                    className="shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {app.name}
                      </p>
                      {app.hasDevScript && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <IconTerminal2 size={10} />
                          dev
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {app.path}
                    </p>
                  </div>
                  {isConnected ? (
                    <Badge variant="outline" className="gap-1">
                      <IconCheck size={12} />
                      Added
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isAdding}
                      onClick={() => void handleAdd(app.path)}
                      className="motion-press"
                    >
                      {isAdding ? <Spinner size="sm" /> : <IconPlus size={14} />}
                      Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Custom root directory"
        description="Add an app by path."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddCustom();
          }}
          className="flex items-center gap-2"
        >
          <Input
            placeholder="e.g. apps/api"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            className="h-8 flex-1 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            disabled={
              !customPath.trim() ||
              addingPath === customPath.trim().replace(/^\/+|\/+$/g, "")
            }
            className="motion-press"
          >
            <IconPlus size={14} />
            Add
          </Button>
        </form>
      </SettingsSection>
    </SettingsPage>
  );
}
