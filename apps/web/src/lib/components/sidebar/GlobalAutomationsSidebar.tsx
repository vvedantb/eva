"use client";

import { useNavigate } from "@tanstack/react-router";
import { useConvex, useMutation, useQueries } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  CenteredSpinner,
  Spinner,
} from "@eva/ui";
import { GlobalAutomationGroup } from "@/lib/components/sidebar/_components/GlobalAutomationGroup";
import { repoBasePaths } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { sortAppsForSidebar } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { AUTOMATIONS_APP_GROUPS_OPEN_KEY } from "@/lib/components/sidebar/_utils/automationsSidebarSettings";
import { useAutomationsSidebarSettings } from "@/lib/components/sidebar/useAutomationsSidebarSettings";
import { useSidebarAppGroupOpen } from "@/lib/components/sidebar/useSidebarAppGroupOpen";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

type AutomationListItem = FunctionReturnType<
  typeof api.automations.list
>[number];
type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];

interface GlobalAutomationsSidebarProps {
  pathname: string;
  onNavigate?: () => void;
}

/**
 * Cross-repo Automations list for the rail entry point: every accessible app as
 * a collapsible group.
 */
export function GlobalAutomationsSidebar({
  pathname,
  onNavigate,
}: GlobalAutomationsSidebarProps) {
  const navigate = useNavigate();
  const convex = useConvex();
  const { settings } = useAutomationsSidebarSettings();
  const { isGroupOpen, setGroupOpen } = useSidebarAppGroupOpen(pathname, {
    storageKey: AUTOMATIONS_APP_GROUPS_OPEN_KEY,
    sectionSegment: "/automations",
  });
  const repos = useQuery(api.githubRepos.list, {});
  const createAutomation = useMutation(api.automations.create);

  const [createTarget, setCreateTarget] = useState<RepoRow | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Stable identity required by useQueries.
  const automationListQueries = useMemo(() => {
    if (repos === undefined) return {};
    return Object.fromEntries(
      repos.map((repo) => [
        repo._id,
        {
          query: api.automations.list,
          args: { repoId: repo._id },
        },
      ]),
    );
  }, [repos]);
  const automationsByRepoId = useQueries(automationListQueries);

  // A monorepo parent's `shared` automations surface in every child app, so
  // claim each one for the app that owns it; anything whose owner is not in
  // the accessible set falls back to the first app that surfaced it.
  const ownedByRepoId = new Map<string, AutomationListItem[]>();
  const loadingByRepoId = new Map<string, boolean>();
  const claimed = new Set<string>();
  for (const repo of repos ?? []) {
    const result = automationsByRepoId[repo._id];
    loadingByRepoId.set(repo._id, result === undefined);
    if (result === undefined || result instanceof Error) {
      ownedByRepoId.set(repo._id, []);
      continue;
    }
    const owned: AutomationListItem[] = [];
    for (const automation of result) {
      if (automation.repoId === repo._id) {
        owned.push(automation);
        claimed.add(automation._id);
      }
    }
    ownedByRepoId.set(repo._id, owned);
  }
  for (const repo of repos ?? []) {
    const result = automationsByRepoId[repo._id];
    if (result === undefined || result instanceof Error) continue;
    const owned = ownedByRepoId.get(repo._id) ?? [];
    for (const automation of result) {
      if (claimed.has(automation._id)) continue;
      owned.push(automation);
      claimed.add(automation._id);
    }
    ownedByRepoId.set(repo._id, owned);
  }

  const latestActivityByAppId = new Map<string, number>();
  for (const [repoId, automations] of ownedByRepoId) {
    let latest = 0;
    for (const automation of automations) {
      const at = automation.updatedAt ?? automation._creationTime;
      if (at > latest) latest = at;
    }
    if (latest > 0) latestActivityByAppId.set(repoId, latest);
  }

  const orderedRepos =
    repos === undefined
      ? undefined
      : sortAppsForSidebar(repos, settings.appSortOrder, latestActivityByAppId);

  const handleCreate = async () => {
    if (!createTarget || !newTitle.trim()) return;
    const repo = createTarget;
    const basePath = repoBasePaths(repo)[0];
    setIsCreating(true);
    try {
      const id = await createAutomation({
        repoId: repo._id,
        title: newTitle.trim(),
      });
      const created = await convex.query(api.automations.get, { id });
      // Guarded with an if rather than a ternary: React Compiler bails on the
      // whole file when a conditional expression sits inside a try/catch.
      if (!created) {
        setIsCreating(false);
        return;
      }
      const segment = entityPathSegment(created);
      if (!segment) {
        setIsCreating(false);
        return;
      }
      setNewTitle("");
      setCreateTarget(null);
      mutationSuccess("Automation created", "automation-create");
      navigate({
        to: toInternalRepoHref(`${basePath}/automations/${segment}`),
      });
      if (onNavigate) onNavigate();
    } catch {
      mutationError("Couldn't create automation", "automation-create");
      setIsCreating(false);
      return;
    }
    setIsCreating(false);
  };

  return (
    <>
      <div className="flex-1 space-y-3 px-0 pb-1">
        {orderedRepos === undefined ? (
          <CenteredSpinner label="Loading automations" className="min-h-48" />
        ) : orderedRepos.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No apps yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect a codebase from Home.
            </p>
          </div>
        ) : (
          orderedRepos.map((repo) => (
            <GlobalAutomationGroup
              key={repo._id}
              repo={repo}
              automations={ownedByRepoId.get(repo._id) ?? []}
              isLoading={loadingByRepoId.get(repo._id) === true}
              pathname={pathname}
              automationSortOrder={settings.automationSortOrder}
              automationPreviewCount={settings.automationPreviewCount}
              open={isGroupOpen(repo)}
              onOpenChange={(open) => {
                setGroupOpen(repo._id, open);
              }}
              onNavigate={onNavigate}
              onCreateRequest={() => {
                setCreateTarget(repo);
              }}
            />
          ))
        )}
      </div>

      <Dialog
        open={createTarget !== null}
        onOpenChange={(open) => {
          if (isCreating) return;
          if (!open) {
            setCreateTarget(null);
            setNewTitle("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Automation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g., Update dependencies weekly"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTitle.trim()) {
                    void handleCreate();
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreateTarget(null);
                  setNewTitle("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !newTitle.trim()}
              >
                {isCreating ? <Spinner size="sm" /> : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
