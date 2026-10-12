"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Surface,
} from "@eva/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

const REQUIRED_KEYS: Array<{
  keys: string[];
  required: boolean;
  description: string;
}> = [
  {
    keys: ["CLAUDE_CODE_OAUTH_TOKEN"],
    required: true,
    description: "OAuth token for Claude Code CLI authentication in sandboxes",
  },
  {
    keys: ["CODEX_AUTH_JSON", "CODEX_AUTH_JSON_BASE64"],
    required: false,
    description:
      "Optional Codex CLI auth file. Prefer CODEX_AUTH_JSON; CODEX_AUTH_JSON_BASE64 also works",
  },
  {
    keys: ["CODEX_CONFIG_TOML", "CODEX_CONFIG_TOML_BASE64"],
    required: false,
    description:
      "Optional Codex CLI config file. Prefer CODEX_CONFIG_TOML; CODEX_CONFIG_TOML_BASE64 also works",
  },
  {
    keys: ["OPENCODE_CONFIG_JSON", "OPENCODE_CONFIG_JSON_BASE64"],
    required: false,
    description:
      "Optional Opencode inline config JSON. Reference provider keys via {env:OPENAI_API_KEY}. Prefer OPENCODE_CONFIG_JSON; OPENCODE_CONFIG_JSON_BASE64 also works",
  },
  {
    keys: ["OPENCODE_AUTH_JSON", "OPENCODE_AUTH_JSON_BASE64"],
    required: false,
    description:
      "Optional Opencode OAuth credentials file (for ChatGPT Plus/Pro). Paste the contents of ~/.local/share/opencode/auth.json after running `opencode auth login` locally. Prefer OPENCODE_AUTH_JSON; OPENCODE_AUTH_JSON_BASE64 also works",
  },
  {
    keys: ["CURSOR_API_KEY"],
    required: false,
    description:
      "Optional Cursor CLI API key. Generate from cursor.com/dashboard → Integrations → API Keys, then paste the full key here to enable Cursor models",
  },
];

export function SetupBanner() {
  const { repo } = useRepo();
  const [dismissed, setDismissed] = useState(false);

  const team = useQuery(
    api.teams.get,
    repo.teamId ? { id: repo.teamId } : "skip",
  );

  const teamEnvVars = useQuery(
    api.teamEnvVars.list,
    repo.teamId ? { teamId: repo.teamId } : "skip",
  );

  const repoEnvVars = useQuery(api.repoEnvVars.list, { repoId: repo._id });

  if (!repo.teamId || !team) {
    return null;
  }

  if (teamEnvVars === undefined || repoEnvVars === undefined) {
    return null;
  }

  const allEnvVars = [...teamEnvVars, ...repoEnvVars];
  const presentKeys = new Set(allEnvVars.map((v) => v.key));
  const missingEntries = REQUIRED_KEYS.filter(
    (entry) => !entry.keys.some((key) => presentKeys.has(key)),
  );
  const hasRequiredMissing = missingEntries.some((entry) => entry.required);

  if (!hasRequiredMissing || dismissed) {
    return null;
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && setDismissed(true)}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
              <IconAlertTriangle size={20} className="text-warning" />
            </div>
            <DialogTitle>Setup Required</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            To use sandboxes and AI features, you need to configure the
            following environment variables in your team or repo settings. To
            enable Codex, sign in locally with Codex once, then paste the saved
            auth JSON into `CODEX_AUTH_JSON`.
          </p>
          <Surface>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Missing Variables:
            </p>
            <div className="flex flex-col gap-2">
              {missingEntries.map((entry) => (
                <div
                  key={entry.keys.join(":")}
                  className="flex flex-col gap-0.5"
                >
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-background px-2 py-1 font-mono text-sm">
                      {entry.keys.join(" or ")}
                    </code>
                    {entry.required ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-3xs font-medium text-destructive">
                        Required
                      </span>
                    ) : (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-3xs font-medium text-warning">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="pl-2 text-xs text-muted-foreground">
                    {entry.description}
                  </p>
                </div>
              ))}
            </div>
          </Surface>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
          <Link to="/teams/$teamId" params={{ teamId: team._id }}>
            <Button>Configure Team Settings</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
