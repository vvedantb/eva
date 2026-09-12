"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SkillRow } from "./skills/_components/SkillRow";
import { SystemSkillRow } from "./skills/_components/SystemSkillRow";
import { Button, motionBase, motionStagger } from "@eva/ui";
import { m } from "motion/react";
import { IconRefresh, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { withMutationToast } from "@/lib/utils/mutationToast";

export function SkillsClient() {
  const { repoId } = useRepo();
  const skills = useQuery(api.repoSkills.listByRepo, { repoId });
  const systemSkills = useQuery(api.repoSystemSkills.listForRepo, { repoId });
  const setInstalled = (name: string, installed: boolean) => {
    return (localStore: OptimisticLocalStore) => {
      const current = localStore.getQuery(api.repoSystemSkills.listForRepo, {
        repoId,
      });
      if (current === undefined) return;
      localStore.setQuery(
        api.repoSystemSkills.listForRepo,
        { repoId },
        current.map((skill) =>
          skill.name === name ? { ...skill, installed } : skill,
        ),
      );
    };
  };
  const installSystemSkill = useMutation(
    api.repoSystemSkills.install,
  ).withOptimisticUpdate((localStore, args) =>
    setInstalled(args.name, true)(localStore),
  );
  const uninstallSystemSkill = useMutation(
    api.repoSystemSkills.uninstall,
  ).withOptimisticUpdate((localStore, args) =>
    setInstalled(args.name, false)(localStore),
  );
  const syncFromGithub = useAction(api.repoSkills.syncFromGithub);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!skills) return null;

  const availableSkills = skills.filter((skill) => skill.available);
  const staleSkills = skills.filter((skill) => !skill.available);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    setWarnings([]);
    setSyncSummary(null);
    try {
      const result = await syncFromGithub({ repoId });
      setWarnings(result.warnings);
      setSyncSummary(
        `${result.available} available, ${result.stale} stale, ${result.skipped} skipped.`,
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Failed to sync skills from GitHub.",
      );
    }
    setSyncing(false);
  };

  return (
    <SettingsPage
      title="Skills"
      headerRight={
        <Button size="sm" onClick={handleSync} disabled={syncing}>
          <IconRefresh size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync from GitHub"}
        </Button>
      }
    >
      {error ? (
        <p className="rounded-control border border-destructive/40 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {syncSummary ? (
        <p className="rounded-control border border-border px-3 py-2 text-xs text-muted-foreground">
          {syncSummary}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <SettingsSection title="Sync warnings" bodyVariant="compact">
          <div className="grid gap-1">
            {warnings.map((warning) => (
              <p
                key={warning}
                className="text-xs leading-relaxed text-muted-foreground"
              >
                {warning}
              </p>
            ))}
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Eva skills"
        description="Built-in skills Eva maintains. Installing one makes it available to this repo's agents without committing anything to your codebase — the agent fetches the instructions from Eva when it runs the skill."
        bodyVariant="list"
      >
        <div className="divide-y divide-border/50">
          {(systemSkills ?? []).map((skill, index) => (
            <m.div
              key={skill.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...motionBase, delay: motionStagger(index) }}
            >
            <SystemSkillRow
              repoId={repoId}
              skill={skill}
              onInstall={(name) =>
                void withMutationToast(
                  installSystemSkill({ repoId, name }),
                  "Skill installed",
                  "Couldn't install skill",
                  "skill-install",
                )
              }
              onUninstall={(name) =>
                void withMutationToast(
                  uninstallSystemSkill({ repoId, name }),
                  "Skill uninstalled",
                  "Couldn't uninstall skill",
                  "skill-uninstall",
                )
              }
            />
            </m.div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Repo skills"
        description={
          <>
            Synced from <code>.agents/skills</code> and{" "}
            <code>.claude/skills</code> on the base branch. Claude-only skills
            are labelled in the <code>/</code> picker.
          </>
        }
        bodyVariant="list"
      >
        {skills.length > 0 ? (
          <div className="divide-y divide-border/50">
            {[...availableSkills, ...staleSkills].map((skill, index) => (
              <m.div
                key={skill._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...motionBase, delay: motionStagger(index) }}
              >
                <SkillRow skill={skill} />
              </m.div>
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            icon={IconSparkles}
            title="No skills synced yet"
            description="Add a SKILL.md under .agents/skills or .claude/skills on the base branch, then select Sync from GitHub."
          />
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
