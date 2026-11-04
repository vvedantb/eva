"use client";

import { type api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { cn } from "@eva/ui";
import { Badge, Button } from "@vvedantb/ui";
import { IconFileText } from "@tabler/icons-react";
import { SkillContentDialog } from "./SkillContentDialog";

type Skill = FunctionReturnType<typeof api.repoSkills.listByRepo>[number];

export function SkillRow({ skill }: { skill: Skill }) {
  const [contentOpen, setContentOpen] = useState(false);

  return (
    <>
      {/* A row inside the skills list section, so the section owns the border. */}
      <div
        className={cn(
          "px-4 py-3 transition-colors hover:bg-muted/40",
          !skill.available && "opacity-60",
        )}
      >
        {/* Stacks below `sm`: a full-width "View contents" button beside the
            title leaves the title one word wide on a phone. */}
        <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 max-sm:max-w-full">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{skill.title}</p>
              {!skill.available ? (
                <Badge variant="secondary" className="text-xs">
                  Stale
                </Badge>
              ) : null}
              {skill.sourcePath?.startsWith(".claude/skills/") ? (
                <Badge variant="secondary" className="text-xs">
                  Claude
                </Badge>
              ) : null}
            </div>
            {skill.sourcePath ? (
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {skill.sourcePath}
              </p>
            ) : null}
          </div>
          {skill.sourcePath ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setContentOpen(true)}
            >
              <IconFileText size={14} />
              View contents
            </Button>
          ) : null}
        </div>
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {skill.description || "No description found in SKILL.md."}
        </p>
      </div>

      <SkillContentDialog
        skillId={skill._id}
        title={skill.title}
        sourcePath={skill.sourcePath}
        open={contentOpen}
        onOpenChange={setContentOpen}
      />
    </>
  );
}
