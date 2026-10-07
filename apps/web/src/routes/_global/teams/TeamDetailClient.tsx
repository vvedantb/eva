import { useRef } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { isTeamDetailTab, type TeamDetailTab } from "@/lib/search-params";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EntityNotFound } from "@/lib/components/EntityNotFound";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { useTeamLogoUpload } from "@/lib/hooks/useTeamLogoUpload";
import { useTeamBackgroundUpload } from "@/lib/hooks/useTeamBackgroundUpload";
import { Tabs, TabsList, TabsTrigger, Button, CenteredSpinner } from "@eva/ui";
import { IconUsers, IconPhoto, IconPhotoOff } from "@tabler/icons-react";
import { TeamActivityTab } from "./_components/TeamActivityTab";
import { TeamMembersTab } from "./_components/TeamMembersTab";
import { TeamReposTab } from "./_components/TeamReposTab";
import { TeamEnvVarsTab } from "./_components/TeamEnvVarsTab";
import { TeamArtifactsTab } from "./_components/TeamArtifactsTab";
import { useNavigate } from "@tanstack/react-router";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

export function TeamDetailClient({
  teamId,
  tab,
}: {
  teamId: string;
  tab: TeamDetailTab;
}) {
  const navigate = useNavigate();
  const simpleView = useSimpleView();
  const team = useQuery(api.teams.get, { id: teamId });
  const members =
    useQuery(api.teamMembers.list, team ? { teamId: team._id } : "skip") ?? [];
  const repos =
    useQuery(
      api.githubRepos.listByTeam,
      team && !simpleView ? { teamId: team._id } : "skip",
    ) ?? [];
  const allRepos =
    useQuery(
      api.githubRepos.list,
      simpleView ? "skip" : { includeHidden: true },
    ) ?? [];
  const teamEnvVars = useQuery(
    api.teamEnvVars.list,
    team && !simpleView ? { teamId: team._id } : "skip",
  );
  const {
    uploadLogo,
    removeLogo,
    uploading: logoUploading,
  } = useTeamLogoUpload();
  const {
    uploadBackground,
    removeBackground,
    uploading: backgroundUploading,
  } = useTeamBackgroundUpload();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  // `useQuery` is `undefined` while the subscription is still in flight, so a
  // single `!team` branch flashed "Team not found" on every cold load of a team
  // that exists. Only `null` is a real miss.
  if (team === undefined) {
    return (
      <PageWrapper title="Team">
        <CenteredSpinner label="Loading team" />
      </PageWrapper>
    );
  }

  if (team === null) {
    return (
      <PageWrapper title="Team">
        <EntityNotFound entityLabel="team" backTo="/teams" />
      </PageWrapper>
    );
  }

  const isOwner = team.userRole === "owner";
  const displayName = team.displayName ?? team.name;

  const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadLogo(team._id, file);
  };

  const handleBackgroundSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadBackground(team._id, file);
  };

  return (
    <PageWrapper
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          <RepoLogo
            logoUrl={team.logoUrl}
            size={28}
            fallback={
              <div className="flex size-7 items-center justify-center rounded-md border border-border bg-muted">
                <IconUsers size={14} className="text-muted-foreground" />
              </div>
            }
          />
          <span className="truncate">{displayName}</span>
        </span>
      }
      comfortable
      headerRight={
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={logoUploading}
            onClick={() => logoInputRef.current?.click()}
            aria-label={team.logoUrl ? "Change logo" : "Set logo"}
          >
            <IconPhoto size={14} className="sm:mr-1.5" />
            {/* The label is noise next to the title on a phone. */}
            <span className="hidden sm:inline">
              {team.logoUrl ? "Change logo" : "Set logo"}
            </span>
          </Button>
          {team.logoUrl ? (
            <Button
              size="icon-sm"
              variant="ghost"
              title="Remove logo"
              disabled={logoUploading}
              onClick={() => void removeLogo(team._id)}
              className="max-sm:size-10"
            >
              <IconPhotoOff size={14} />
            </Button>
          ) : null}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoSelected}
          />
        </div>
      }
      tabs={
        <Tabs
          value={tab}
          onValueChange={(v) => {
            if (isTeamDetailTab(v)) {
              navigate({
                to: `/teams/${teamId}/${v}`,
              });
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            {simpleView ? null : (
              <>
                <TabsTrigger value="codebases">Codebases</TabsTrigger>
                <TabsTrigger value="env">Env Variables</TabsTrigger>
              </>
            )}
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {/* Stacks below `sm`: the copy plus two controls cannot share a phone
          row without shredding the description into one word per line. */}
      <div className="mb-4 flex flex-col items-start gap-3 rounded-surface bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {/* `size-10` is unconditional: it is this preview's only size, not a
              mobile enlargement of a smaller desktop one. Gating it behind
              `max-sm:` left the box unsized above 640px, and an indefinite
              parent cannot resolve the `size-full` image inside — the banner
              rendered at its intrinsic width and blew the row apart (f160d6423). */}
          <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {team.backgroundUrl ? (
              <img
                src={team.backgroundUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <IconPhoto size={14} className="text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Sidebar background
            </p>
            <p className="text-xs text-muted-foreground">
              Shown behind the team name in the sidebar.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={backgroundUploading}
            onClick={() => backgroundInputRef.current?.click()}
          >
            <IconPhoto size={14} className="mr-1.5" />
            {team.backgroundUrl ? "Change" : "Upload"}
          </Button>
          {team.backgroundUrl ? (
            <Button
              size="icon-sm"
              variant="ghost"
              title="Remove background"
              disabled={backgroundUploading}
              onClick={() => void removeBackground(team._id)}
              className="max-sm:size-10"
            >
              <IconPhotoOff size={14} />
            </Button>
          ) : null}
          <input
            ref={backgroundInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBackgroundSelected}
          />
        </div>
      </div>

      {tab === "activity" ? <TeamActivityTab members={members} /> : null}
      {tab === "members" ? (
        <TeamMembersTab
          teamId={team._id}
          teamName={displayName}
          members={members}
          isOwner={isOwner}
        />
      ) : null}
      {simpleView ? null : tab === "codebases" ? (
        <TeamReposTab
          teamId={team._id}
          repos={repos}
          allRepos={allRepos}
          isOwner={isOwner}
        />
      ) : null}
      {simpleView ? null : tab === "env" ? (
        <TeamEnvVarsTab teamId={team._id} teamEnvVars={teamEnvVars} />
      ) : null}
      {tab === "artifacts" ? <TeamArtifactsTab teamId={team._id} /> : null}
    </PageWrapper>
  );
}
