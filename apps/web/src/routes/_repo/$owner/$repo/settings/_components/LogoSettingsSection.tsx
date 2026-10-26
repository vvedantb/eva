"use client";

import { useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Button, Input, SettingsField } from "@vvedantb/ui";
import { IconPhoto } from "@tabler/icons-react";
import { useRepoLogoUpload } from "@/lib/hooks/useRepoLogoUpload";
import { useRepo } from "@/lib/contexts/RepoContext";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";

/** Display name + logo for this app (App settings). */
export function LogoSettingsSection({ repoId }: { repoId: Id<"githubRepos"> }) {
  const { repo, owner, name } = useRepo();
  const logoUrl = useQuery(api.githubRepos.getLogoUrl, { repoId });
  const { uploadLogo, removeLogo, uploading } = useRepoLogoUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appName = repo.rootDirectory?.split("/").pop();
  const fallbackName = repoDisplayLabel({
    name: repo.name,
    rootDirectory: repo.rootDirectory,
  });

  const updateConfig = useMutation(
    api.githubRepos.updateConfig,
  ).withOptimisticUpdate((localStore, args) => {
    if (args.label === undefined) return;
    const queryArgs = { owner, name, appName };
    const current = localStore.getQuery(
      api.githubRepos.getByOwnerAndName,
      queryArgs,
    );
    if (current !== undefined && current !== null) {
      const nextLabel =
        args.label.trim().length > 0 ? args.label.trim() : undefined;
      localStore.setQuery(api.githubRepos.getByOwnerAndName, queryArgs, {
        ...current,
        label: nextLabel,
      });
    }
  });

  const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadLogo(repoId, file);
  };

  const handleLabelBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next === (repo.label ?? "")) return;
    updateConfig({ repoId, label: next });
  };

  return (
    <SettingsSection
      title="Identity"
      description="Name and logo in the sidebar for this app."
    >
      <div className="grid gap-5">
        <SettingsField
          label="Display name"
          description={
            <>
              Leave empty for{" "}
              <span className="font-medium">{fallbackName}</span>.
            </>
          }
        >
          <Input
            key={`label-${repoId}`}
            className="h-9"
            placeholder={fallbackName}
            defaultValue={repo.label ?? ""}
            onBlur={handleLabelBlur}
          />
        </SettingsField>

        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center overflow-hidden rounded-control bg-muted outline outline-1 outline-black/10 dark:outline-white/10">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <IconPhoto size={24} className="text-muted-foreground" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading..." : logoUrl ? "Change" : "Upload"}
            </Button>
            {logoUrl ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={uploading}
                onClick={() => removeLogo(repoId)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoSelected}
      />
    </SettingsSection>
  );
}
