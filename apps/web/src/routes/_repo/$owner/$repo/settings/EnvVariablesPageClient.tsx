"use client";

import { Tabs, TabsList, TabsTrigger, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import type { EnvVarScope } from "@/lib/search-params";
import { useNavigate } from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { EnvVariablesClient } from "./EnvVariablesClient";
import { TeamEnvVarsClient } from "./TeamEnvVarsClient";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

export function EnvVariablesPageClient({ scope }: { scope: EnvVarScope }) {
  const navigate = useNavigate();
  const { basePath } = useRepo();

  return (
    <SettingsPage
      title="Environment Variables"
      stack={false}
      tabs={
        <Tabs
          value={scope}
          onValueChange={(value) => {
            if (value === "repo" || value === "team") {
              navigate({
                to: toInternalRepoHref(
                  `${basePath}/settings/env-variables/${value}`,
                ),
              });
            }
          }}
        >
          <TabsList className="tabs-segmented">
            <TabsTrigger value="repo">Repo</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={scope}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          {scope === "repo" ? <EnvVariablesClient /> : null}
          {scope === "team" ? <TeamEnvVarsClient /> : null}
        </m.div>
      </AnimatePresence>
    </SettingsPage>
  );
}
