"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vvedantb/ui";
import { IconUpload } from "@tabler/icons-react";
import { parseArtifactMeta, parseStorageId } from "./_meta";

/**
 * Upload a Cowork artifact HTML file and bind it to a team. Parses the
 * cowork-artifact-meta manifest to pre-fill the name/description/tools. When
 * `defaultTeamId` is given (the team tab) the team is fixed and the picker is
 * hidden; otherwise the user chooses from their teams.
 */
export function ArtifactUploadDialog({
  defaultTeamId,
}: {
  defaultTeamId?: Id<"teams">;
}) {
  const teams = useQuery(api.teams.list) ?? [];
  const generateUploadUrl = useMutation(api.artifacts.generateUploadUrl);
  const create = useMutation(api.artifacts.create);

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [declaredTools, setDeclaredTools] = useState<string[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFileName(null);
    setHtml("");
    setName("");
    setDescription("");
    setDeclaredTools([]);
    setSelectedTeamId("");
    setError(null);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const meta = parseArtifactMeta(text, file.name.replace(/\.html?$/i, ""));
    setFileName(file.name);
    setHtml(text);
    setName(meta.name);
    setDescription(meta.description);
    setDeclaredTools(meta.declaredTools);
  };

  const onSubmit = async () => {
    setError(null);

    const teamId =
      defaultTeamId ?? teams.find((t) => t._id === selectedTeamId)?._id;
    if (!teamId) {
      setError("Choose a team.");
      return;
    }
    if (!html) {
      setError("Choose an artifact HTML file.");
      return;
    }
    if (!name.trim()) {
      setError("Give the artifact a name.");
      return;
    }

    setUploading(true);
    // Built before the try, and the compound guard below split into two: React
    // Compiler bails on the whole file when a conditional or logical expression
    // sits inside a try/catch.
    const artifactDescription = description.trim() || undefined;
    try {
      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "text/html" },
        body: html,
      });
      const storageId = parseStorageId(await res.text());
      if (!res.ok) {
        setError("Upload failed.");
        setUploading(false);
        return;
      }
      if (!storageId) {
        setError("Upload failed.");
        setUploading(false);
        return;
      }

      await create({
        name: name.trim(),
        description: artifactDescription,
        boundTeamId: teamId,
        declaredTools,
        htmlStorageId: storageId,
      });
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUploading(false);
      return;
    }
    setUploading(false);
  };

  const bareTools = declaredTools
    .map((t) => t.split("__").pop() ?? t)
    .join(", ");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <IconUpload size={16} />
          Upload artifact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload artifact</DialogTitle>
        </DialogHeader>

        {/* DialogBody, not a plain div: the dialog caps its own height, so the
            form has to scroll internally rather than being clipped on a short
            (or landscape) phone. */}
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artifact-file">Artifact HTML</Label>
            <input
              id="artifact-file"
              type="file"
              accept=".html,text/html"
              onChange={onFileChange}
              className="text-sm file:mr-3 file:rounded-surface file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
            {fileName ? (
              <span className="max-sm:break-all text-xs text-muted-foreground">
                {fileName}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artifact-name">Name</Label>
            <Input
              id="artifact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Artifact name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artifact-description">Description</Label>
            <Textarea
              id="artifact-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What this artifact shows"
            />
          </div>

          {defaultTeamId ? null : (
            <div className="flex flex-col gap-1.5">
              <Label>Team</Label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {bareTools ? (
            <p className="text-xs text-muted-foreground">
              Declares tools: {bareTools}
            </p>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={uploading || !html}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
