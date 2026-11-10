"use client";

import type { api, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Badge, Button } from "@vvedantb/ui";
import { IconFileText } from "@tabler/icons-react";
import { SystemSkillContentDialog } from "./SystemSkillContentDialog";

type SystemSkill = FunctionReturnType<
  typeof api.repoSystemSkills.listForRepo
>[number];

export function SystemSkillRow({
  repoId,
  skill,
  onInstall,
  onUninstall,
}: {
  repoId: Id<"githubRepos">;
  skill: SystemSkill;
  onInstall: (name: string) => void;
  onUninstall: (name: string) => void;
}) {
  const [contentOpen, setContentOpen] = useState(false);

  return (
    <>
      {/* A row inside the skills list section, so the section owns the border. */}
      <div className="px-4 py-3 transition-colors hover:bg-muted/40">
        {/* Stacks below `sm`: "View contents" + Install is ~200px, which leaves
            no room for the skill name on a phone. */}
        <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 max-sm:max-w-full">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-sm font-medium max-sm:wrap-break-word">
                {skill.name}
              </p>
              {skill.installed ? (
                <Badge variant="secondary" className="text-xs">
                  Installed
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 max-sm:flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setContentOpen(true)}
            >
              <IconFileText size={14} />
              View contents
            </Button>
            <Button
              type="button"
              variant={skill.installed ? "outline" : "default"}
              size="sm"
              onClick={() =>
                skill.installed
                  ? onUninstall(skill.name)
                  : onInstall(skill.name)
              }
            >
              {skill.installed ? "Uninstall" : "Install"}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {skill.description}
        </p>
      </div>

      <SystemSkillContentDialog
        repoId={repoId}
        name={skill.name}
        open={contentOpen}
        onOpenChange={setContentOpen}
      />
    </>
  );
}
