import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
  userFacingErrorMessage,
} from "@vvedantb/ui";

export type NewApp = FunctionReturnType<
  typeof api.github.syncRepos
>["newApps"][number];

const appKey = (app: NewApp) => `${app.owner}/${app.name}:${app.path}`;

/**
 * Shown after "Sync Repos" finds monorepo apps Eva has never seen. Ticked apps
 * are added; unticked ones are added hidden, so sync does not offer them
 * again. Closing without saving changes nothing.
 */
export function NewAppsDialog({
  apps,
  onClose,
}: {
  apps: ReadonlyArray<NewApp>;
  onClose: () => void;
}) {
  const importDetectedApps = useAction(api.github.importDetectedApps);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const codebases = new Map<string, NewApp[]>();
  for (const app of apps) {
    const key = `${app.owner}/${app.name}`;
    codebases.set(key, [...(codebases.get(key) ?? []), app]);
  }

  const toggle = (app: NewApp, add: boolean) => {
    const next = new Set(skipped);
    if (add) next.delete(appKey(app));
    else next.add(appKey(app));
    setSkipped(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const group of codebases.values()) {
        const [first] = group;
        await importDetectedApps({
          owner: first.owner,
          name: first.name,
          installationId: first.installationId,
          teamId: first.teamId,
          apps: group.map((app) => ({
            path: app.path,
            add: !skipped.has(appKey(app)),
          })),
        });
      }
      onClose();
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err instanceof Error ? err : null,
          "Couldn't save apps",
        ),
      );
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New apps found</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Unticked apps are hidden. Show them again from Hidden Codebases.
        </p>
        <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
          {[...codebases].map(([codebase, group]) => (
            <div key={codebase} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">
                {codebase}
              </p>
              {group.map((app) => (
                <label
                  key={app.path}
                  title={app.path}
                  className="flex cursor-pointer items-center gap-3 rounded-surface px-2 py-1.5 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={!skipped.has(appKey(app))}
                    onCheckedChange={(checked) => toggle(app, checked === true)}
                  />
                  <span className="truncate text-sm text-foreground">
                    {app.appName}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Later
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
