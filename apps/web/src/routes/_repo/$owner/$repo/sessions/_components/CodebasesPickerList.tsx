"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@eva/ui";
import { IconCheck, IconDots, IconLink } from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";
import { repoHref, toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  codebaseNameCollides,
  type CodebaseGroup,
  type CodebaseRepoRow,
} from "../_utils";

/** One row's logo + label, shared by group rows and repo rows. */
function RowIdentity({
  logoUrl,
  seed,
  label,
}: {
  logoUrl: string | null | undefined;
  seed: string;
  label: string;
}) {
  return (
    <>
      <RepoLogo
        logoUrl={logoUrl}
        size={20}
        fallback={
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white",
              repoTileColor(seed),
            )}
          >
            {label.charAt(0).toUpperCase()}
          </span>
        }
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  );
}

/** A saved group whose primary IS the current repo: pick applies it directly. */
export function OwnGroupRow({
  group,
  active,
  onPick,
  onRename,
  onDelete,
}: {
  group: CodebaseGroup;
  active: boolean;
  onPick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);

  if (renaming) {
    return (
      <form
        className="flex items-center gap-1.5 px-1 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = draftName.trim();
          if (trimmed) onRename(trimmed);
          setRenaming(false);
        }}
      >
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => setRenaming(false)}
          className="h-7 text-xs"
        />
      </form>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate font-medium">{group.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {group.linkedRepos.length + 1} repos
        </span>
        {active ? (
          <IconCheck size={14} className="ml-auto shrink-0 text-primary" />
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={`${group.name} options`}
          >
            <IconDots size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setDraftName(group.name);
              setRenaming(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A saved group whose primary is a DIFFERENT repo: deep-links to it instead. */
export function ForeignGroupRow({ group }: { group: CodebaseGroup }) {
  if (!group.primaryRepo) return null;
  const primary = group.primaryRepo;
  const linked = group.linkedRepoIds.join(",");
  return (
    <Link
      to={toInternalRepoHref(
        repoHref(primary.owner, primary.name, primary.rootDirectory),
      )}
      // `linked`/`group` are nuqs-owned, so they are absent from the router's
      // typed search union and a bare object literal is rejected. The updater
      // form carries the current search through and adds them on top, which is
      // also what nuqs itself does when the picker writes these keys.
      search={(prev) => ({ ...prev, linked, group: String(group._id) })}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
    >
      <RowIdentity
        logoUrl={primary.logoUrl}
        seed={`${primary.owner}/${primary.name}`}
        label={group.name}
      />
      <IconLink size={13} className="shrink-0 text-muted-foreground" />
      <span className="shrink-0 truncate text-xs text-muted-foreground">
        {repoDisplayLabel(primary)}
      </span>
    </Link>
  );
}

/** One selectable "other repo" row, disabled when its name collides. */
export function RepoRow({
  repo,
  primary,
  selected,
  isSelected,
  onToggle,
}: {
  repo: CodebaseRepoRow;
  primary: { name: string };
  selected: readonly { name: string }[];
  isSelected: boolean;
  onToggle: () => void;
}) {
  const label = repoDisplayLabel(repo);
  const collides =
    !isSelected && codebaseNameCollides(repo, primary, selected);

  const row = (
    <button
      type="button"
      disabled={collides}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        collides
          ? "cursor-not-allowed opacity-45"
          : isSelected
            ? "bg-muted"
            : "hover:bg-muted/60",
      )}
    >
      <RowIdentity
        logoUrl={repo.logoUrl}
        seed={`${repo.owner}/${repo.name}/${label}`}
        label={label}
      />
      {isSelected ? (
        <IconCheck size={14} className="shrink-0 text-primary" />
      ) : null}
    </button>
  );

  if (!collides) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{row}</div>
      </TooltipTrigger>
      <TooltipContent>
        Repository name "{repo.name}" collides with an already-selected
        codebase
      </TooltipContent>
    </Tooltip>
  );
}

export function PickerSectionLabel({ children }: { children: string }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
      {children}
    </div>
  );
}

export function PickerSeparator() {
  return <Separator className="my-2" />;
}
