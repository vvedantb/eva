"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import {
  Textarea,
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@vvedantb/ui";
import { IconPencil } from "@tabler/icons-react";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { withMutationToast } from "@/lib/utils/mutationToast";

export function McpConfigClient() {
  const { repo, repoId } = useRepo();
  const updateMcpRootPrompt = useMutation(api.githubRepos.updateMcpRootPrompt);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const prompt = repo.mcpRootPrompt ?? "";

  const handleOpen = () => {
    setDraft(prompt);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    // Built before the try: React Compiler bails on the whole file when a
    // logical expression sits inside a try/catch.
    const trimmedPrompt = draft.trim() || undefined;
    try {
      await withMutationToast(
        updateMcpRootPrompt({
          repoId,
          mcpRootPrompt: trimmedPrompt,
        }),
        "Root prompt saved",
        "Couldn't save root prompt",
        "mcp-root-prompt-save",
      );
      setOpen(false);
    } catch {
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const isDirty = draft !== prompt;

  return (
    <SettingsPage title="MCP Config">
      <SettingsSection
        title="Root prompt"
        description="Shared instructions injected into MCP context."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0"
                onClick={handleOpen}
              >
                <IconPencil size={14} />
                Edit
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit root prompt</DialogTitle>
                <DialogDescription>
                  Shared instructions injected into MCP context.
                </DialogDescription>
              </DialogHeader>

              <DialogBody>
                <Textarea
                  className="min-h-[280px] text-xs font-mono"
                  placeholder="Describe your repo's data topology, table relationships, or any context the MCP server should know..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </DialogBody>

              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {prompt ? (
          // Nested inside the card, so the prompt steps to the muted tone.
          <pre className="whitespace-pre-wrap max-sm:wrap-break-word rounded-control border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground/80">
            {prompt}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">
            No root prompt configured. Select Edit to add one.
          </p>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
