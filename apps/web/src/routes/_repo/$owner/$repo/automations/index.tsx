import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { OptimisticLocalStore } from "convex/browser";
import { CenteredSpinner, motionBase, motionStagger } from "@eva/ui";
import { m } from "motion/react";
import { CountPop } from "@/lib/components/ui/CountPop";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SystemAutomationCard } from "./_components/SystemAutomationCard";
import { withMutationToast } from "@/lib/utils/mutationToast";

/**
 * Flips `installed` in the Hub list so the card switches over before the server
 * round-trip. `numId` waits for the real row.
 */
function patchInstalled(installed: boolean) {
  return (
    localStore: OptimisticLocalStore,
    args: { repoId: Id<"githubRepos">; key: string },
  ) => {
    const queryArgs = { repoId: args.repoId };
    const current = localStore.getQuery(
      api.automations.listSystemAutomations,
      queryArgs,
    );
    if (current === undefined) return;
    localStore.setQuery(
      api.automations.listSystemAutomations,
      queryArgs,
      current.map((entry) =>
        entry.key === args.key
          ? {
              ...entry,
              installed,
              enabled: installed,
              numId: installed ? entry.numId : null,
            }
          : entry,
      ),
    );
  };
}

export const Route = createFileRoute("/_repo/$owner/$repo/automations/")({
  staticData: { title: "Automations" },
  component: AutomationsHubPage,
});

/**
 * Automations Hub: the eva-managed automation catalog for this app. Installing
 * one adds it to the app's automations; the definition stays owned by eva.
 */
function AutomationsHubPage() {
  const { repoId, basePath } = useRepo();
  const systemAutomations = useQuery(api.automations.listSystemAutomations, {
    repoId,
  });

  const install = useMutation(
    api.automations.installSystemAutomation,
  ).withOptimisticUpdate(patchInstalled(true));
  const uninstall = useMutation(
    api.automations.uninstallSystemAutomation,
  ).withOptimisticUpdate(patchInstalled(false));

  const installedCount =
    systemAutomations?.filter((entry) => entry.installed).length ?? 0;

  return (
    <PageWrapper comfortable insetHeader title="Automations">
      <div className="flex flex-col gap-5">
        {/* Divider stays full-bleed; the copy takes the same `px-4` card gutter
            as section titles, so it lines up with the page title above. */}
        <div className="border-b border-border pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3 px-4">
            <div className="max-w-prose">
              <h2 className="text-sm font-semibold">Automations Hub</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Automations built and maintained by eva. Install one to add it
                to this app — set your own schedule, switch it off, run it on
                demand. The prompt stays ours to improve, so every app gets the
                fix.
              </p>
            </div>
            {systemAutomations !== undefined && (
              <CountPop
                label={`${installedCount}/${systemAutomations.length}`}
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              >
                {installedCount} of {systemAutomations.length} installed
              </CountPop>
            )}
          </div>
        </div>

        {systemAutomations === undefined ? (
          <CenteredSpinner label="Loading automations" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {systemAutomations.map((entry, index) => (
              <m.div
                key={entry.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...motionBase, delay: motionStagger(index) }}
              >
              <SystemAutomationCard
                entryKey={entry.key}
                readOnly={entry.readOnly}
                title={entry.title}
                blurb={entry.blurb}
                cronSchedule={entry.cronSchedule}
                installed={entry.installed}
                numId={entry.numId}
                basePath={basePath}
                onInstall={() => {
                  void withMutationToast(
                    install({ repoId, key: entry.key }),
                    "Automation installed",
                    "Couldn't install automation",
                    "system-automation-install",
                  );
                }}
                onUninstall={() => {
                  void withMutationToast(
                    uninstall({ repoId, key: entry.key }),
                    "Automation removed",
                    "Couldn't uninstall automation",
                    "system-automation-uninstall",
                  );
                }}
              />
              </m.div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
