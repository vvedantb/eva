"use client";

import { useState } from "react";
import { Input, Button, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import type { Id } from "@eva/backend";
import { IconPlus, IconX } from "@tabler/icons-react";
import { extractHostname } from "../_utils";
import { SettingsField } from "@/lib/components/settings/SettingsField";

type UpdateRepoConfig = (args: {
  repoId: Id<"githubRepos">;
  domains?: string[];
}) => void;

export function DomainsSection({
  repoId,
  domains,
  updateConfig,
}: {
  repoId: Id<"githubRepos">;
  domains: string[];
  updateConfig: UpdateRepoConfig;
}) {
  const [newDomain, setNewDomain] = useState("");

  const addDomain = () => {
    const raw = newDomain.trim().toLowerCase();
    if (!raw) return;
    const hostname = extractHostname(raw);
    if (domains.includes(hostname)) return;
    updateConfig({ repoId, domains: [...domains, hostname] });
    setNewDomain("");
  };

  const removeDomain = (domain: string) => {
    updateConfig({ repoId, domains: domains.filter((d) => d !== domain) });
  };

  return (
    <SettingsField
      label="Domains"
      description="Hostnames for this app. The Chrome extension picks this repo when you visit them."
    >
      <div className="space-y-2">
        {domains.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false} mode="popLayout">
              {domains.map((domain) => (
                <m.span
                  key={domain}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={motionFast}
                >
                  {domain}
                  <button
                    type="button"
                    onClick={() => removeDomain(domain)}
                    className="relative rounded-sm p-0.5 text-muted-foreground transition-colors after:absolute after:inset-[-6px] hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${domain}`}
                  >
                    <IconX size={12} />
                  </button>
                </m.span>
              ))}
            </AnimatePresence>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Input
            className="h-9 flex-1"
            placeholder="myapp.com or localhost:3000"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addDomain();
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={addDomain}
            disabled={!newDomain.trim()}
          >
            <IconPlus size={14} />
            Add
          </Button>
        </div>
      </div>
    </SettingsField>
  );
}
