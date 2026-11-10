import { useState } from "react";
import { Button, Spinner, Surface } from "@vvedantb/ui";
import { IconCheck, IconFolder } from "@tabler/icons-react";

export interface MonorepoApp {
  name: string;
  path: string;
  hasDevScript: boolean;
}

interface MonorepoAppsPanelProps {
  apps: MonorepoApp[];
  isDetecting: boolean;
  addedRepos: Set<string>;
  repoFullName: string;
  onAddApp: (path: string) => void;
}

export function MonorepoAppsPanel({
  apps,
  isDetecting,
  addedRepos,
  repoFullName,
  onAddApp,
}: MonorepoAppsPanelProps) {
  const [customRootDir, setCustomRootDir] = useState("");

  if (isDetecting) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Spinner size="sm" />
        <span className="text-xs text-muted-foreground">
          Detecting workspace apps...
        </span>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        No workspace apps detected. This repo can be added as a single project.
      </p>
    );
  }

  return (
    <>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Monorepo apps detected:
      </p>
      {apps.map((app) => {
        const key = `${repoFullName}:${app.path}`;
        return (
          <Surface
            key={app.path}
            density="none"
            className="flex items-center justify-between p-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <IconFolder className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {app.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {app.path}
                  {app.hasDevScript && " · has dev script"}
                </p>
              </div>
            </div>
            {addedRepos.has(key) ? (
              <span className="flex items-center gap-1 text-success text-xs shrink-0">
                <IconCheck className="w-3 h-3" />
                Added
              </span>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => onAddApp(app.path)}
              >
                Add
              </Button>
            )}
          </Surface>
        );
      })}
      <div className="flex items-center gap-2 pt-2">
        <input
          type="text"
          placeholder="Custom root directory..."
          aria-label="Custom root directory"
          value={customRootDir}
          onChange={(e) => setCustomRootDir(e.target.value)}
          className="max-sm:min-w-0 flex-1 rounded-control border border-border bg-background px-2 py-1.5 text-sm"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!customRootDir.trim()}
          onClick={() => {
            onAddApp(customRootDir.trim());
            setCustomRootDir("");
          }}
        >
          Add
        </Button>
      </div>
    </>
  );
}
