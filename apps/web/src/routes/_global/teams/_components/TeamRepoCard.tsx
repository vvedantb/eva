import { useRef, useState } from "react";
import type { api, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { cn } from "@eva/ui";
import {
  Button,
  Card,
  CardContent,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import {
  IconDots,
  IconGitBranch,
  IconTrash,
  IconPhoto,
  IconPhotoOff,
  IconPencil,
} from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { RepoLabelDialog } from "@/lib/components/RepoLabelDialog";
import { useRepoLogoUpload } from "@/lib/hooks/useRepoLogoUpload";
import { appLeafName, repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { TeamRepoCardMenuItems } from "./TeamRepoCardMenuItems";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";

type Repo = FunctionReturnType<typeof api.githubRepos.listByTeam>[number];

/** A single repo row in the team repos tab, with logo display + owner actions. */
export function TeamRepoCard({
  repo,
  teamId,
  isOwner,
  onRemove,
}: {
  repo: Repo;
  teamId: Id<"teams">;
  isOwner: boolean;
  onRemove: (repoId: Id<"githubRepos">) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const { uploadLogo, removeLogo } = useRepoLogoUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadLogo(repo._id, file);
  };

  const menuProps = {
    isOwner,
    hasLogo: Boolean(repo.logoUrl),
    onRename: () => setRenameOpen(true),
    onPickLogo: () => fileInputRef.current?.click(),
    onRemoveLogo: () => removeLogo(repo._id),
    onRemove: () => onRemove(repo._id),
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Card>
            <CardContent className="flex items-center justify-between p-3 sm:p-4">
              <div className="flex min-w-0 items-center gap-2">
                <RepoLogo
                  logoUrl={repo.logoUrl}
                  size={28}
                  fallback={
                    <IconGitBranch
                      size={28}
                      className="text-muted-foreground"
                    />
                  }
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {repoDisplayLabel(repo)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {repo.owner}/{repo.name}
                  </p>
                </div>
              </div>
              {/* Four 28px icon buttons plus a kebab side by side on a phone is
                  worse than either alone, so the inline row is the pointer-device
                  affordance and the kebab below `sm` hosts the same actions. */}
              {isOwner && (
                <div className="hidden max-sm:shrink-0 items-center gap-1 sm:flex">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Rename"
                    onClick={() => setRenameOpen(true)}
                  >
                    <IconPencil size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={repo.logoUrl ? "Change logo" : "Set logo"}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconPhoto size={14} />
                  </Button>
                  {repo.logoUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove logo"
                      onClick={() => removeLogo(repo._id)}
                    >
                      <IconPhotoOff size={14} />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Remove from team"
                    onClick={() => onRemove(repo._id)}
                  >
                    <IconTrash size={14} />
                  </Button>
                </div>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Repository actions"
                    onClick={(e) => e.stopPropagation()}
                    className={cn("relative max-sm:shrink-0", CARD_KEBAB_CLASS)}
                  >
                    <IconDots className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TeamRepoCardMenuItems variant="dropdown" {...menuProps} />
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoSelected}
              />
            </CardContent>
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <TeamRepoCardMenuItems variant="context" {...menuProps} />
        </ContextMenuContent>
      </ContextMenu>
      <RepoLabelDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        repoId={repo._id}
        label={repo.label}
        fallbackName={appLeafName(repo)}
        teamId={teamId}
      />
    </>
  );
}
