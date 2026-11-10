import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";
import { cn } from "@eva/ui";
import {
  Card,
  CardHeader,
  CardTitle,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import { IconDots, IconUsers } from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { useTeamLogoUpload } from "@/lib/hooks/useTeamLogoUpload";
import { TeamCardMenuItems } from "./TeamCardMenuItems";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";

type Team = FunctionReturnType<typeof api.teams.list>[number];

/** Team list card with logo display and a right-click menu for logo and delete. */
export function TeamCard({
  team,
  onDelete,
}: {
  team: Team;
  onDelete?: (team: { id: Id<"teams">; name: string }) => void;
}) {
  const { uploadLogo, removeLogo } = useTeamLogoUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canDelete = team.userRole === "owner" && team.isPersonal !== true;
  const displayName = team.displayName ?? team.name;

  const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadLogo(team._id, file);
  };

  const menuProps = {
    hasLogo: Boolean(team.logoUrl),
    canDelete,
    onPickLogo: () => fileInputRef.current?.click(),
    onRemoveLogo: () => void removeLogo(team._id),
    onDelete: onDelete
      ? () => onDelete({ id: team._id, name: displayName })
      : undefined,
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="relative">
            <Link
              to="/teams/$teamId"
              params={{ teamId: team._id }}
              className="block rounded-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <Card className="h-full transition-colors hover:bg-muted/50">
                {/* `max-sm:pr-10` reserves the lane the touch kebab sits in so
                    the role pill never runs under it. */}
                <CardHeader className="max-sm:pr-10">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <RepoLogo
                        logoUrl={team.logoUrl}
                        size={32}
                        fallback={
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <IconUsers size={16} className="text-primary" />
                          </div>
                        }
                      />
                      <CardTitle className="text-base">{displayName}</CardTitle>
                    </div>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                      {team.userRole}
                    </span>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            {/* Touch has no right-click, so below `sm` the same items get a
                visible kebab. It is a sibling of the <Link> rather than a child
                (a button may not nest in an anchor) and sits above it at z-2. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Team actions"
                  onClick={(e) => e.stopPropagation()}
                  className={cn("absolute right-2 top-4 z-2", CARD_KEBAB_CLASS)}
                >
                  <IconDots className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <TeamCardMenuItems variant="dropdown" {...menuProps} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <TeamCardMenuItems variant="context" {...menuProps} />
        </ContextMenuContent>
      </ContextMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoSelected}
      />
    </>
  );
}
