import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { m } from "motion/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { repoHref } from "@/lib/utils/repoUrl";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { RepoLabelDialog } from "@/lib/components/RepoLabelDialog";
import { useRepoLogoUpload } from "@/lib/hooks/useRepoLogoUpload";
import { appLeafName, repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { catchMutationError } from "@/lib/utils/mutationToast";
import {
  cn,
  Card,
  CardContent,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  motionBase,
  motionStagger,
} from "@eva/ui";
import {
  IconBrandGithub,
  IconDots,
  IconPlugConnectedX,
} from "@tabler/icons-react";
import { RepoCardMenuItems } from "./RepoCardMenuItems";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";

export type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

export function RepoCard({
  repo,
  index,
  onManageApps,
}: {
  repo: Repo;
  index: number;
  onManageApps: () => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const toggleHidden = useMutation(
    api.githubRepos.toggleHidden,
  ).withOptimisticUpdate((localStore, args) => {
    const visible = localStore.getQuery(api.githubRepos.list, {});
    if (visible !== undefined && args.hidden) {
      localStore.setQuery(
        api.githubRepos.list,
        {},
        visible.filter((r) => r._id !== args.repoId),
      );
    }
  });
  const { uploadLogo, removeLogo } = useRepoLogoUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadLogo(repo._id, file);
  };

  const menuProps = {
    hasLogo: Boolean(repo.logoUrl),
    onRename: () => setRenameOpen(true),
    onManageApps,
    onPickLogo: () => fileInputRef.current?.click(),
    onRemoveLogo: () => removeLogo(repo._id),
    onHide: () =>
      void catchMutationError(
        toggleHidden({ repoId: repo._id, hidden: true }),
        "Couldn't hide codebase",
        "repo-hide",
      ),
  };

  return (
    <m.div
      key={repo._id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ ...motionBase, delay: motionStagger(index) }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="group/card relative">
            <Link
              to={repoHref(repo.owner, repo.name, repo.rootDirectory)}
              className="block rounded-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <Card className="motion-emphasized ui-surface-interactive cursor-pointer">
                {/* `max-sm:pr-10` reserves the lane the touch kebab sits in, so
                    the label and the disconnected pill never run under it. */}
                <CardContent className="flex items-center gap-3 p-4 max-sm:pr-10">
                  <RepoLogo
                    logoUrl={repo.logoUrl}
                    size={28}
                    fallback={
                      <IconBrandGithub
                        size={28}
                        className={
                          repo.connected === false
                            ? "text-destructive/60"
                            : "text-muted-foreground"
                        }
                      />
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {repoDisplayLabel(repo)}
                    </p>
                    <p className="mt-0.5 max-sm:truncate text-xs text-muted-foreground">
                      {repo.owner}/{repo.name}
                    </p>
                  </div>
                  {repo.connected === false && (
                    <div className="flex max-sm:shrink-0 items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-destructive">
                      <IconPlugConnectedX size={11} />
                      <span className="text-2xs font-medium">
                        Disconnected
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
            {/* Touch has no right-click, so below `sm` the same items get a
                visible kebab. It is a sibling of the <Link> rather than a child
                (a button may not nest in an anchor) and sits above it at z-2. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Repository actions"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "absolute right-1.5 top-1/2 z-2 -translate-y-1/2",
                    CARD_KEBAB_CLASS,
                  )}
                >
                  <IconDots className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <RepoCardMenuItems variant="dropdown" {...menuProps} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <RepoCardMenuItems variant="context" {...menuProps} />
        </ContextMenuContent>
      </ContextMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoSelected}
      />
      <RepoLabelDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        repoId={repo._id}
        label={repo.label}
        fallbackName={appLeafName(repo)}
      />
    </m.div>
  );
}
